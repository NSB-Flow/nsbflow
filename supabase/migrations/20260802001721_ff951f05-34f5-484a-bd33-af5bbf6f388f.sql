-- 1) Solicitações de assinatura (checkout deixa de ativar plano direto)
CREATE TABLE IF NOT EXISTS public.subscription_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  billing_cycle public.billing_cycle NOT NULL DEFAULT 'monthly',
  seats integer NOT NULL DEFAULT 1 CHECK (seats >= 1 AND seats <= 10000),
  coupon_code text,
  amount_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  invoice_id uuid REFERENCES public.subscription_invoices(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subscription_requests TO authenticated;
GRANT ALL ON public.subscription_requests TO service_role;

ALTER TABLE public.subscription_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subreq_read" ON public.subscription_requests;
CREATE POLICY "subreq_read" ON public.subscription_requests FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_workspace_member(auth.uid(), workspace_id));

DROP POLICY IF EXISTS "subreq_no_client_write" ON public.subscription_requests;
CREATE POLICY "subreq_no_client_write" ON public.subscription_requests FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

CREATE INDEX IF NOT EXISTS subscription_requests_ws_idx ON public.subscription_requests(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS subscription_requests_status_idx ON public.subscription_requests(status, created_at DESC);

DROP TRIGGER IF EXISTS update_subscription_requests_updated_at ON public.subscription_requests;
CREATE TRIGGER update_subscription_requests_updated_at
  BEFORE UPDATE ON public.subscription_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Bloqueia auto-ativação de plano pelo cliente
CREATE OR REPLACE FUNCTION public.guard_subscription_billing_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role / automação interna (sem JWT) e super admin seguem livres
  IF auth.uid() IS NULL OR public.is_super_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.seats IS DISTINCT FROM OLD.seats
     OR NEW.billing_cycle IS DISTINCT FROM OLD.billing_cycle
     OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
     OR NEW.current_period_start IS DISTINCT FROM OLD.current_period_start
     OR NEW.current_period_end IS DISTINCT FROM OLD.current_period_end
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.provider_customer_id IS DISTINCT FROM OLD.provider_customer_id
     OR NEW.provider_subscription_id IS DISTINCT FROM OLD.provider_subscription_id
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
  THEN
    RAISE EXCEPTION 'Campos de cobrança só podem ser alterados pela automação de cobrança';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_subscription_billing_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_subscription_billing_update() FROM anon;
REVOKE ALL ON FUNCTION public.guard_subscription_billing_update() FROM authenticated;

DROP TRIGGER IF EXISTS guard_subscription_billing_update_trg ON public.subscriptions;
CREATE TRIGGER guard_subscription_billing_update_trg
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.guard_subscription_billing_update();

-- Criação de assinatura só via automação/super admin
DROP POLICY IF EXISTS "subs_insert" ON public.subscriptions;
CREATE POLICY "subs_insert" ON public.subscriptions FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 3) Cron passa a enviar o segredo compartilhado
DO $$
BEGIN
  PERFORM cron.unschedule('drain-export-jobs');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'drain-export-jobs',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--42ad62af-0035-432e-8662-c041ae8d0f8d.lovable.app/api/public/hooks/process-export-jobs',
    headers := '{"Content-Type":"application/json","x-cron-secret":"e8b8b21b8ef51aa2b53a0868feba59edf9ef6ba7a3bb2e9f83040795cf43121f"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);