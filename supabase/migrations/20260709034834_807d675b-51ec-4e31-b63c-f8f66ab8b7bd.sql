
-- Additional enums
DO $$ BEGIN CREATE TYPE public.plan_tier AS ENUM ('smart','pro','enterprise'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.subscription_status AS ENUM ('trialing','active','past_due','canceled','expired'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.billing_cycle AS ENUM ('monthly','yearly'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.payment_provider AS ENUM ('stripe','mercadopago','asaas','pagseguro','manual'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- WORKSPACES
CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  logo_url text,
  is_personal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT ALL ON public.workspaces TO service_role;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'vendedor',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
GRANT ALL ON public.workspace_members TO service_role;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Security definer helpers
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin')
$$;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_workspace_member(_user_id uuid, _workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.workspace_members WHERE user_id = _user_id AND workspace_id = _workspace_id AND active = true)
$$;
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_workspace_admin(_user_id uuid, _workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.workspace_members WHERE user_id = _user_id AND workspace_id = _workspace_id AND active = true
    AND role IN ('super_admin','admin','admin_empresa','ceo','diretor'))
$$;
REVOKE EXECUTE ON FUNCTION public.is_workspace_admin(uuid,uuid) FROM PUBLIC, anon, authenticated;

-- workspaces policies
CREATE POLICY "ws_read" ON public.workspaces FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), id) OR public.is_super_admin(auth.uid()));
CREATE POLICY "ws_insert" ON public.workspaces FOR INSERT TO authenticated WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "ws_update" ON public.workspaces FOR UPDATE TO authenticated
  USING (public.is_workspace_admin(auth.uid(), id) OR public.is_super_admin(auth.uid()));
CREATE POLICY "ws_delete" ON public.workspaces FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR owner_user_id = auth.uid());

CREATE POLICY "wm_read" ON public.workspace_members FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_super_admin(auth.uid()) OR user_id = auth.uid());
CREATE POLICY "wm_insert" ON public.workspace_members FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_admin(auth.uid(), workspace_id) OR public.is_super_admin(auth.uid()) OR user_id = auth.uid());
CREATE POLICY "wm_update" ON public.workspace_members FOR UPDATE TO authenticated
  USING (public.is_workspace_admin(auth.uid(), workspace_id) OR public.is_super_admin(auth.uid()));
CREATE POLICY "wm_delete" ON public.workspace_members FOR DELETE TO authenticated
  USING (public.is_workspace_admin(auth.uid(), workspace_id) OR public.is_super_admin(auth.uid()));

-- PLANS
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier public.plan_tier NOT NULL,
  name text NOT NULL,
  description text,
  price_monthly_cents integer NOT NULL DEFAULT 0,
  price_yearly_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  max_users integer,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO anon, authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_read" ON public.plans FOR SELECT TO anon, authenticated USING (active = true OR public.is_super_admin(auth.uid()));
CREATE POLICY "plans_write" ON public.plans FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TABLE public.plan_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  quota integer,
  UNIQUE(plan_id, feature_key)
);
GRANT SELECT ON public.plan_features TO anon, authenticated;
GRANT ALL ON public.plan_features TO service_role;
ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pf_read" ON public.plan_features FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "pf_write" ON public.plan_features FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- SUBSCRIPTIONS
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  status public.subscription_status NOT NULL DEFAULT 'trialing',
  billing_cycle public.billing_cycle NOT NULL DEFAULT 'monthly',
  seats integer NOT NULL DEFAULT 1,
  trial_ends_at timestamptz,
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  provider public.payment_provider NOT NULL DEFAULT 'manual',
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subs_read" ON public.subscriptions FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_super_admin(auth.uid()));
CREATE POLICY "subs_insert" ON public.subscriptions FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_admin(auth.uid(), workspace_id) OR public.is_super_admin(auth.uid()));
CREATE POLICY "subs_update" ON public.subscriptions FOR UPDATE TO authenticated
  USING (public.is_workspace_admin(auth.uid(), workspace_id) OR public.is_super_admin(auth.uid()));
CREATE POLICY "subs_delete" ON public.subscriptions FOR DELETE TO authenticated USING (public.is_super_admin(auth.uid()));

CREATE TABLE public.subscription_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  provider_invoice_id text,
  pdf_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.subscription_invoices TO authenticated;
GRANT ALL ON public.subscription_invoices TO service_role;
ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_read" ON public.subscription_invoices FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.subscriptions s WHERE s.id = subscription_id
    AND (public.is_workspace_member(auth.uid(), s.workspace_id) OR public.is_super_admin(auth.uid()))));
CREATE POLICY "inv_write" ON public.subscription_invoices FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TABLE public.enterprise_module_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(subscription_id, feature_key)
);
GRANT SELECT ON public.enterprise_module_grants TO authenticated;
GRANT ALL ON public.enterprise_module_grants TO service_role;
ALTER TABLE public.enterprise_module_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emg_read" ON public.enterprise_module_grants FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.subscriptions s WHERE s.id = subscription_id
    AND (public.is_workspace_member(auth.uid(), s.workspace_id) OR public.is_super_admin(auth.uid()))));
CREATE POLICY "emg_write" ON public.enterprise_module_grants FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  percent_off integer,
  amount_off_cents integer,
  currency text DEFAULT 'BRL',
  valid_until timestamptz,
  max_redemptions integer,
  redeemed_count integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coup_read" ON public.coupons FOR SELECT TO authenticated USING (active = true OR public.is_super_admin(auth.uid()));
CREATE POLICY "coup_write" ON public.coupons FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- workspace_id on existing tables
ALTER TABLE public.agent_runs ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.attachments ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_agent_runs_workspace ON public.agent_runs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_attachments_workspace ON public.attachments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_companies_workspace ON public.companies(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wm_user ON public.workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_wm_workspace ON public.workspace_members(workspace_id);

CREATE TRIGGER trg_workspaces_updated BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_subs_updated BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Revised handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_workspace_id uuid;
  v_smart_plan_id uuid;
  v_slug text;
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  v_slug := 'ws-' || substr(replace(NEW.id::text,'-',''),1,12);
  INSERT INTO public.workspaces (name, slug, owner_user_id, is_personal)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'full_name','Meu Workspace'), v_slug, NEW.id, true)
  RETURNING id INTO v_workspace_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, NEW.id, 'admin_empresa');

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin_empresa') ON CONFLICT DO NOTHING;

  SELECT id INTO v_smart_plan_id FROM public.plans WHERE tier = 'smart' AND active = true LIMIT 1;
  IF v_smart_plan_id IS NOT NULL THEN
    INSERT INTO public.subscriptions (workspace_id, plan_id, status, trial_ends_at, current_period_end, seats)
    VALUES (v_workspace_id, v_smart_plan_id, 'trialing', now() + interval '3 days', now() + interval '3 days', 1);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SEED plans
INSERT INTO public.plans (tier, name, description, price_monthly_cents, price_yearly_cents, max_users, sort_order) VALUES
  ('smart','Smart','Ideal para profissionais individuais.', 19700, 197000, 1, 1),
  ('pro','Pro','Ideal para pequenas empresas.', 69700, 697000, 5, 2),
  ('enterprise','Enterprise','Plano corporativo customizável.', 0, 0, NULL, 3);

INSERT INTO public.plan_features (plan_id, feature_key, enabled)
SELECT p.id, k, true FROM public.plans p, unnest(ARRAY['deap.meeting.briefing','deap.meeting.intelligence','history','pdf.export']) k WHERE p.tier = 'smart';

INSERT INTO public.plan_features (plan_id, feature_key, enabled)
SELECT p.id, k, true FROM public.plans p, unnest(ARRAY[
  'deap.meeting.briefing','deap.meeting.intelligence',
  'deap.assessment.sales','deap.assessment.leadership','deap.assessment.process','deap.assessment.executive',
  'dashboard.executive','reports','history','pdf.export','biblioteca','academy'
]) k WHERE p.tier = 'pro';

INSERT INTO public.plan_features (plan_id, feature_key, enabled)
SELECT p.id, k, true FROM public.plans p, unnest(ARRAY[
  'deap.meeting.briefing','deap.meeting.intelligence',
  'deap.assessment.sales','deap.assessment.leadership','deap.assessment.process','deap.assessment.executive',
  'dashboard.executive','reports','history','pdf.export','biblioteca','academy','empresas','pessoas'
]) k WHERE p.tier = 'enterprise';
