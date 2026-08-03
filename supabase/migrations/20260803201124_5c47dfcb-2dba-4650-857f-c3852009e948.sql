CREATE OR REPLACE FUNCTION public.try_consume_agent_credits(
  _workspace_id uuid,
  _user_id uuid,
  _run_id uuid,
  _description text,
  _units integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sub record;
  v_wc record;
  v_uc record;
  v_units integer := GREATEST(1, COALESCE(_units, 1));
  v_from_ws integer := 0;
  v_from_user integer := 0;
  v_remaining integer;
BEGIN
  SELECT s.*, p.tier AS plan_tier, p.monthly_credits
    INTO v_sub
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
   WHERE s.workspace_id = _workspace_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_subscription');
  END IF;

  IF v_sub.plan_tier = 'enterprise' OR v_sub.monthly_credits IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'source', 'unlimited', 'units', v_units);
  END IF;

  PERFORM public.apply_workspace_allotment(_workspace_id);

  SELECT * INTO v_wc FROM public.workspace_credits WHERE workspace_id = _workspace_id FOR UPDATE;
  v_from_ws := LEAST(v_units, GREATEST(COALESCE(v_wc.balance, 0), 0));
  v_remaining := v_units - v_from_ws;

  IF v_remaining > 0 THEN
    IF NOT public.has_active_paid_subscription(_user_id) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'workspace_empty_and_user_ineligible');
    END IF;
    SELECT * INTO v_uc FROM public.user_credits WHERE user_id = _user_id FOR UPDATE;
    IF COALESCE(v_uc.balance, 0) < v_remaining THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'all_pools_empty');
    END IF;
    v_from_user := v_remaining;
  END IF;

  IF v_from_ws > 0 THEN
    UPDATE public.workspace_credits SET balance = balance - v_from_ws WHERE workspace_id = _workspace_id;
    INSERT INTO public.workspace_credit_transactions (workspace_id, amount, kind, reference_id, description, created_by)
      VALUES (_workspace_id, -v_from_ws, 'consume', _run_id, _description, _user_id);
  END IF;

  IF v_from_user > 0 THEN
    UPDATE public.user_credits SET balance = balance - v_from_user WHERE user_id = _user_id;
    INSERT INTO public.credit_transactions (user_id, amount, kind, reference_id, description)
      VALUES (_user_id, -v_from_user, 'redeem', _run_id, COALESCE(_description, 'Consumo de agente'));
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'units', v_units,
    'source', CASE WHEN v_from_user > 0 AND v_from_ws > 0 THEN 'workspace+user'
                   WHEN v_from_user > 0 THEN 'user' ELSE 'workspace' END,
    'from_workspace', v_from_ws,
    'from_user', v_from_user
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.try_consume_agent_credits(uuid, uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_consume_agent_credits(uuid, uuid, uuid, text, integer) TO service_role;