CREATE OR REPLACE FUNCTION public.apply_referral_paid(_referred_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ref record;
  v_bonus integer := 50;
BEGIN
  -- Somente automação interna / service_role (sem JWT) ou super admin
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  -- O indicado precisa ter, de fato, assinatura paga ativa
  IF NOT public.has_active_paid_subscription(_referred_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'referred_not_paid');
  END IF;

  SELECT * INTO v_ref FROM public.referrals
   WHERE referred_user_id = _referred_user_id
     AND status IN ('signed_up','pending')
   ORDER BY created_at ASC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pending_referral');
  END IF;

  IF NOT public.has_active_paid_subscription(v_ref.referrer_user_id) THEN
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
$function$;

REVOKE ALL ON FUNCTION public.apply_referral_paid(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_referral_paid(uuid) TO service_role;