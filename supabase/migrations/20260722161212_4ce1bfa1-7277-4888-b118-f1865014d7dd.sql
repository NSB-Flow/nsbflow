
-- 1) plans.monthly_credits
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS monthly_credits integer;
UPDATE public.plans SET monthly_credits = 100 WHERE tier = 'smart';
UPDATE public.plans SET monthly_credits = 250 WHERE tier = 'pro';
UPDATE public.plans SET monthly_credits = NULL WHERE tier = 'enterprise';

-- 2) workspace_credits
CREATE TABLE IF NOT EXISTS public.workspace_credits (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0,
  period_start timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.workspace_credits TO authenticated;
GRANT ALL ON public.workspace_credits TO service_role;
ALTER TABLE public.workspace_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wc_read" ON public.workspace_credits FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_super_admin(auth.uid()));
CREATE TRIGGER trg_wc_updated BEFORE UPDATE ON public.workspace_credits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) workspace_credit_transactions
CREATE TABLE IF NOT EXISTS public.workspace_credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('allotment_reset','allotment_rollover','consume','manual_adjust')),
  reference_id uuid,
  description text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wctx_ws ON public.workspace_credit_transactions(workspace_id, created_at DESC);
GRANT SELECT ON public.workspace_credit_transactions TO authenticated;
GRANT ALL ON public.workspace_credit_transactions TO service_role;
ALTER TABLE public.workspace_credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wctx_read" ON public.workspace_credit_transactions FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_super_admin(auth.uid()));

-- 4) has_active_paid_subscription
CREATE OR REPLACE FUNCTION public.has_active_paid_subscription(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    JOIN public.workspace_members wm ON wm.workspace_id = s.workspace_id AND wm.user_id = _user_id AND wm.active
    JOIN public.plans p ON p.id = s.plan_id
    WHERE s.status = 'active' AND p.tier IN ('smart','pro','enterprise')
  );
$$;
REVOKE ALL ON FUNCTION public.has_active_paid_subscription(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_paid_subscription(uuid) TO authenticated, service_role;

-- 5) apply_workspace_allotment (lazy monthly reset/rollover)
CREATE OR REPLACE FUNCTION public.apply_workspace_allotment(_workspace_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ws record;
  v_sub record;
  v_plan record;
  v_month_start timestamptz := date_trunc('month', now());
  v_alloc integer;
  v_multiplier integer;
  v_credits integer;
  v_current record;
  v_kind text;
  v_new_balance integer;
BEGIN
  SELECT * INTO v_ws FROM public.workspaces WHERE id = _workspace_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_sub FROM public.subscriptions WHERE workspace_id = _workspace_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_plan FROM public.plans WHERE id = v_sub.plan_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Enterprise: no pool tracking
  IF v_plan.tier = 'enterprise' OR v_plan.monthly_credits IS NULL THEN
    RETURN;
  END IF;

  -- Multiplier: PF = 1, PJ = seats
  IF v_ws.is_personal THEN
    v_multiplier := 1;
  ELSE
    v_multiplier := GREATEST(1, COALESCE(v_sub.seats, 1));
  END IF;

  v_alloc := v_plan.monthly_credits * v_multiplier;

  -- Ensure row exists
  INSERT INTO public.workspace_credits (workspace_id, balance, period_start)
  VALUES (_workspace_id, 0, NULL)
  ON CONFLICT (workspace_id) DO NOTHING;

  SELECT * INTO v_current FROM public.workspace_credits WHERE workspace_id = _workspace_id FOR UPDATE;

  -- Already applied this period?
  IF v_current.period_start IS NOT NULL AND v_current.period_start >= v_month_start THEN
    RETURN;
  END IF;

  -- Smart = reset; Pro = rollover
  IF v_plan.tier = 'smart' THEN
    v_new_balance := v_alloc;
    v_kind := 'allotment_reset';
  ELSE
    v_new_balance := COALESCE(v_current.balance, 0) + v_alloc;
    v_kind := 'allotment_rollover';
  END IF;

  UPDATE public.workspace_credits
     SET balance = v_new_balance, period_start = v_month_start
   WHERE workspace_id = _workspace_id;

  INSERT INTO public.workspace_credit_transactions (workspace_id, amount, kind, description)
  VALUES (_workspace_id, v_alloc, v_kind,
          format('%s créditos × %s assento(s) — plano %s', v_plan.monthly_credits, v_multiplier, v_plan.tier));
END;
$$;
REVOKE ALL ON FUNCTION public.apply_workspace_allotment(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_workspace_allotment(uuid) TO service_role;

-- 6) try_consume_agent_credit
-- Returns json: { ok, source, workspace_balance, user_balance, reason? }
CREATE OR REPLACE FUNCTION public.try_consume_agent_credit(
  _workspace_id uuid, _user_id uuid, _run_id uuid, _description text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub record;
  v_plan record;
  v_wc record;
  v_uc record;
  v_eligible boolean;
BEGIN
  SELECT s.*, p.tier AS plan_tier, p.monthly_credits
    INTO v_sub
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
   WHERE s.workspace_id = _workspace_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_subscription');
  END IF;

  -- Enterprise: unlimited
  IF v_sub.plan_tier = 'enterprise' OR v_sub.monthly_credits IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'source', 'unlimited');
  END IF;

  -- Ensure allotment applied
  PERFORM public.apply_workspace_allotment(_workspace_id);

  -- Try workspace pool
  SELECT * INTO v_wc FROM public.workspace_credits WHERE workspace_id = _workspace_id FOR UPDATE;
  IF FOUND AND COALESCE(v_wc.balance,0) > 0 THEN
    UPDATE public.workspace_credits SET balance = balance - 1 WHERE workspace_id = _workspace_id;
    INSERT INTO public.workspace_credit_transactions (workspace_id, amount, kind, reference_id, description, created_by)
      VALUES (_workspace_id, -1, 'consume', _run_id, _description, _user_id);
    RETURN jsonb_build_object('ok', true, 'source', 'workspace', 'workspace_balance', v_wc.balance - 1);
  END IF;

  -- Try personal pool (only if eligible)
  v_eligible := public.has_active_paid_subscription(_user_id);
  IF NOT v_eligible THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'workspace_empty_and_user_ineligible');
  END IF;

  SELECT * INTO v_uc FROM public.user_credits WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND OR COALESCE(v_uc.balance,0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'all_pools_empty');
  END IF;

  UPDATE public.user_credits SET balance = balance - 1 WHERE user_id = _user_id;
  INSERT INTO public.credit_transactions (user_id, amount, kind, reference_id, description)
    VALUES (_user_id, -1, 'redeem', _run_id, COALESCE(_description, 'Consumo de agente'));

  RETURN jsonb_build_object('ok', true, 'source', 'user', 'user_balance', v_uc.balance - 1);
END;
$$;
REVOKE ALL ON FUNCTION public.try_consume_agent_credit(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_consume_agent_credit(uuid, uuid, uuid, text) TO service_role;

-- 7) apply_referral_paid: idempotent bonus on first conversion of _referred_user_id
CREATE OR REPLACE FUNCTION public.apply_referral_paid(_referred_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ref record;
  v_bonus integer := 50;
BEGIN
  SELECT * INTO v_ref FROM public.referrals
   WHERE referred_user_id = _referred_user_id
     AND status IN ('signed_up','pending')
   ORDER BY created_at ASC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pending_referral');
  END IF;

  -- Referrer eligibility: must currently have active paid subscription
  IF NOT public.has_active_paid_subscription(v_ref.referrer_user_id) THEN
    -- Mark as void so it doesn't retrigger (event-based, non-pending per spec)
    UPDATE public.referrals SET status = 'void' WHERE id = v_ref.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'referrer_ineligible');
  END IF;

  UPDATE public.referrals
     SET status = 'converted',
         converted_at = now(),
         credits_awarded = credits_awarded + v_bonus
   WHERE id = v_ref.id;

  INSERT INTO public.user_credits (user_id, balance, lifetime_earned)
    VALUES (v_ref.referrer_user_id, v_bonus, v_bonus)
    ON CONFLICT (user_id) DO UPDATE
      SET balance = public.user_credits.balance + EXCLUDED.balance,
          lifetime_earned = public.user_credits.lifetime_earned + EXCLUDED.lifetime_earned;

  INSERT INTO public.credit_transactions (user_id, amount, kind, reference_id, description)
    VALUES (v_ref.referrer_user_id, v_bonus, 'referral_paid', _referred_user_id,
            'Indicação convertida em plano pago');

  RETURN jsonb_build_object('ok', true, 'bonus', v_bonus);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_referral_paid(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_referral_paid(uuid) TO service_role;

-- 8) Fix handle_new_user signup bonus 100 -> 5, and add eligibility gate
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
  v_incoming_ref text;
  v_referrer_id uuid;
  v_credits_amount int := 5; -- CHANGED: signup bonus now 5
BEGIN
  v_ref_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

  INSERT INTO public.profiles (id, full_name, referral_code)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), v_ref_code)
  ON CONFLICT (id) DO UPDATE SET referral_code = COALESCE(public.profiles.referral_code, EXCLUDED.referral_code);

  v_slug := 'ws-' || substr(replace(NEW.id::text,'-',''),1,12);
  INSERT INTO public.workspaces (name, slug, owner_user_id, is_personal)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'full_name','Meu Workspace'), v_slug, NEW.id, true)
  RETURNING id INTO v_workspace_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, NEW.id, 'admin_empresa');

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'vendedor') ON CONFLICT DO NOTHING;

  INSERT INTO public.user_credits (user_id, balance) VALUES (NEW.id, 0) ON CONFLICT DO NOTHING;

  SELECT id INTO v_smart_plan_id FROM public.plans WHERE tier = 'smart' AND active = true LIMIT 1;
  IF v_smart_plan_id IS NOT NULL THEN
    INSERT INTO public.subscriptions (workspace_id, plan_id, status, trial_ends_at, current_period_end, seats)
    VALUES (v_workspace_id, v_smart_plan_id, 'trialing', now() + interval '3 days', now() + interval '3 days', 1);
  END IF;

  v_incoming_ref := NULLIF(upper(trim(NEW.raw_user_meta_data->>'ref_code')), '');
  IF v_incoming_ref IS NULL THEN RETURN NEW; END IF;
  IF v_incoming_ref !~ '^[A-Z0-9]{4,32}$' THEN RETURN NEW; END IF;

  SELECT id INTO v_referrer_id FROM public.profiles
   WHERE upper(referral_code) = v_incoming_ref LIMIT 1;
  IF v_referrer_id IS NULL OR v_referrer_id = NEW.id THEN RETURN NEW; END IF;

  -- Always record referral (needed for later paid conversion)
  INSERT INTO public.referrals (referrer_user_id, referred_user_id, code, status, credits_awarded, signed_up_at)
  VALUES (v_referrer_id, NEW.id, v_incoming_ref, 'signed_up', 0, now());

  -- Signup bonus only if referrer is currently eligible (active paid sub)
  IF public.has_active_paid_subscription(v_referrer_id) THEN
    UPDATE public.referrals SET credits_awarded = v_credits_amount
      WHERE referrer_user_id = v_referrer_id AND referred_user_id = NEW.id;

    INSERT INTO public.user_credits (user_id, balance, lifetime_earned)
    VALUES (v_referrer_id, v_credits_amount, v_credits_amount)
    ON CONFLICT (user_id) DO UPDATE
      SET balance = public.user_credits.balance + EXCLUDED.balance,
          lifetime_earned = public.user_credits.lifetime_earned + EXCLUDED.lifetime_earned;

    INSERT INTO public.credit_transactions (user_id, amount, kind, reference_id, description)
    VALUES (v_referrer_id, v_credits_amount, 'referral_signup', NEW.id,
            'Indicação: novo cadastro (' || COALESCE(NEW.email, NEW.id::text) || ')');
  END IF;

  RETURN NEW;
END;
$function$;
