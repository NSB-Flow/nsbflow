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
  v_credits_amount int := 100;
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

  -- Referral processing (defensive: only credits when code is present, well-formed, and matches an existing profile)
  v_incoming_ref := NULLIF(upper(trim(NEW.raw_user_meta_data->>'ref_code')), '');

  IF v_incoming_ref IS NULL THEN
    -- no code sent: nothing to do
    RETURN NEW;
  END IF;

  -- Basic shape check: alphanumeric, 4..32 chars. Anything else is rejected without touching referral tables.
  IF v_incoming_ref !~ '^[A-Z0-9]{4,32}$' THEN
    RAISE LOG 'handle_new_user: ignoring malformed ref_code % for user %', v_incoming_ref, NEW.id;
    RETURN NEW;
  END IF;

  -- Resolve to a real profile. If it does not exist, we do NOT create any referral / credit rows.
  SELECT id INTO v_referrer_id
  FROM public.profiles
  WHERE upper(referral_code) = v_incoming_ref
  LIMIT 1;

  IF v_referrer_id IS NULL THEN
    RAISE LOG 'handle_new_user: ref_code % not found; no referral credited for user %', v_incoming_ref, NEW.id;
    RETURN NEW;
  END IF;

  IF v_referrer_id = NEW.id THEN
    RAISE LOG 'handle_new_user: self-referral blocked for user %', NEW.id;
    RETURN NEW;
  END IF;

  -- All checks passed: record referral and credit the referrer.
  INSERT INTO public.referrals (referrer_user_id, referred_user_id, code, status, credits_awarded, signed_up_at)
  VALUES (v_referrer_id, NEW.id, v_incoming_ref, 'signed_up', v_credits_amount, now());

  INSERT INTO public.user_credits (user_id, balance, lifetime_earned)
  VALUES (v_referrer_id, v_credits_amount, v_credits_amount)
  ON CONFLICT (user_id) DO UPDATE
    SET balance = public.user_credits.balance + EXCLUDED.balance,
        lifetime_earned = public.user_credits.lifetime_earned + EXCLUDED.lifetime_earned;

  INSERT INTO public.credit_transactions (user_id, amount, kind, reference_id, description)
  VALUES (v_referrer_id, v_credits_amount, 'referral_signup', NEW.id,
          'Indicação: novo cadastro (' || COALESCE(NEW.email, NEW.id::text) || ')');

  RETURN NEW;
END;
$function$;