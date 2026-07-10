
-- 1) Update plan prices
UPDATE public.plans SET price_monthly_cents = 9700, price_yearly_cents = 97000 WHERE tier = 'smart';
UPDATE public.plans SET price_monthly_cents = 49700, price_yearly_cents = 497000 WHERE tier = 'pro';

-- 2) Default new user role: vendedor (instead of admin_empresa) at platform level.
-- They remain admin_empresa of THEIR OWN personal workspace so they can manage it.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id uuid;
  v_smart_plan_id uuid;
  v_slug text;
  v_ref_code text;
BEGIN
  v_ref_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

  INSERT INTO public.profiles (id, full_name, referral_code)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), v_ref_code)
  ON CONFLICT (id) DO UPDATE SET referral_code = COALESCE(public.profiles.referral_code, EXCLUDED.referral_code);

  v_slug := 'ws-' || substr(replace(NEW.id::text,'-',''),1,12);
  INSERT INTO public.workspaces (name, slug, owner_user_id, is_personal)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'full_name','Meu Workspace'), v_slug, NEW.id, true)
  RETURNING id INTO v_workspace_id;

  -- Owner of their own workspace = admin_empresa (workspace scope)
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, NEW.id, 'admin_empresa');

  -- Global platform role defaults to 'vendedor'
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'vendedor') ON CONFLICT DO NOTHING;

  -- Seed credits row
  INSERT INTO public.user_credits (user_id, balance) VALUES (NEW.id, 0) ON CONFLICT DO NOTHING;

  SELECT id INTO v_smart_plan_id FROM public.plans WHERE tier = 'smart' AND active = true LIMIT 1;
  IF v_smart_plan_id IS NOT NULL THEN
    INSERT INTO public.subscriptions (workspace_id, plan_id, status, trial_ends_at, current_period_end, seats)
    VALUES (v_workspace_id, v_smart_plan_id, 'trialing', now() + interval '3 days', now() + interval '3 days', 1);
  END IF;

  RETURN NEW;
END;
$function$;

-- 3) profiles: referral_code
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;

-- Backfill referral codes for existing users
UPDATE public.profiles
SET referral_code = upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))
WHERE referral_code IS NULL;

-- 4) user_credits
CREATE TABLE IF NOT EXISTS public.user_credits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0,
  lifetime_earned integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_credits TO authenticated;
GRANT ALL ON public.user_credits TO service_role;
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credits_self_read" ON public.user_credits
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_user_credits_updated
  BEFORE UPDATE ON public.user_credits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) credit_transactions
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('referral_signup','referral_paid','manual_adjust','redeem','bonus')),
  reference_id uuid,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.credit_transactions TO authenticated;
GRANT ALL ON public.credit_transactions TO service_role;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit_tx_self_read" ON public.credit_transactions
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON public.credit_transactions(user_id, created_at DESC);

-- 6) referrals
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','signed_up','converted','void')),
  credits_awarded integer NOT NULL DEFAULT 0,
  signed_up_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "referrals_self_read" ON public.referrals
  FOR SELECT TO authenticated
  USING (referrer_user_id = auth.uid() OR referred_user_id = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals(referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON public.referrals(code);

-- 7) Seed credits/profiles rows for existing users (idempotent)
INSERT INTO public.user_credits (user_id, balance)
SELECT id, 0 FROM auth.users
ON CONFLICT DO NOTHING;
