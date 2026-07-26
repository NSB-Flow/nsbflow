
CREATE TABLE public.module_grant_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid,
  workspace_id uuid,
  feature_key text NOT NULL,
  action text NOT NULL,
  old_enabled boolean,
  new_enabled boolean,
  actor_user_id uuid,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.module_grant_audit TO authenticated;
GRANT ALL ON public.module_grant_audit TO service_role;

ALTER TABLE public.module_grant_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin can read module_grant_audit"
  ON public.module_grant_audit FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE INDEX idx_module_grant_audit_created_at ON public.module_grant_audit (created_at DESC);
CREATE INDEX idx_module_grant_audit_workspace ON public.module_grant_audit (workspace_id);
CREATE INDEX idx_module_grant_audit_feature ON public.module_grant_audit (feature_key);

CREATE OR REPLACE FUNCTION public.log_module_grant_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_headers json;
  v_ip text;
  v_ua text;
  v_ws uuid;
  v_sub_id uuid;
  v_feature text;
  v_action text;
  v_old boolean;
  v_new boolean;
BEGIN
  BEGIN
    v_headers := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN v_headers := NULL;
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
    v_sub_id := NEW.subscription_id; v_feature := NEW.feature_key;
    v_action := 'created'; v_new := NEW.enabled;
  ELSIF TG_OP = 'UPDATE' THEN
    v_sub_id := NEW.subscription_id; v_feature := NEW.feature_key;
    v_action := CASE WHEN NEW.enabled IS DISTINCT FROM OLD.enabled
      THEN (CASE WHEN NEW.enabled THEN 'enabled' ELSE 'disabled' END)
      ELSE 'updated' END;
    v_old := OLD.enabled; v_new := NEW.enabled;
  ELSE
    v_sub_id := OLD.subscription_id; v_feature := OLD.feature_key;
    v_action := 'removed'; v_old := OLD.enabled;
  END IF;

  SELECT workspace_id INTO v_ws FROM public.subscriptions WHERE id = v_sub_id;

  INSERT INTO public.module_grant_audit
    (subscription_id, workspace_id, feature_key, action, old_enabled, new_enabled, actor_user_id, ip, user_agent)
  VALUES
    (v_sub_id, v_ws, v_feature, v_action, v_old, v_new, auth.uid(), v_ip, v_ua);

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.log_module_grant_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_module_grant_audit ON public.enterprise_module_grants;
CREATE TRIGGER trg_module_grant_audit
AFTER INSERT OR UPDATE OR DELETE ON public.enterprise_module_grants
FOR EACH ROW EXECUTE FUNCTION public.log_module_grant_change();
