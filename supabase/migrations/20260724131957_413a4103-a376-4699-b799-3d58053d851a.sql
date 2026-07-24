
ALTER TABLE public.user_role_audit
  ADD COLUMN IF NOT EXISTS ip text,
  ADD COLUMN IF NOT EXISTS user_agent text;

CREATE OR REPLACE FUNCTION public.log_user_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_headers json;
  v_ip text;
  v_ua text;
BEGIN
  BEGIN
    v_headers := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN
    v_headers := NULL;
  END;

  IF v_headers IS NOT NULL THEN
    v_ip := COALESCE(
      split_part(v_headers->>'x-forwarded-for', ',', 1),
      v_headers->>'cf-connecting-ip',
      v_headers->>'x-real-ip'
    );
    v_ip := NULLIF(trim(v_ip), '');
    v_ua := NULLIF(v_headers->>'user-agent', '');
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.user_role_audit (target_user_id, role, action, actor_user_id, ip, user_agent)
    VALUES (NEW.user_id, NEW.role, 'granted', auth.uid(), v_ip, v_ua);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.user_role_audit (target_user_id, role, action, actor_user_id, ip, user_agent)
    VALUES (OLD.user_id, OLD.role, 'revoked', auth.uid(), v_ip, v_ua);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
