
CREATE TABLE IF NOT EXISTS public.workspace_member_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  workspace_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('added','removed','role_changed','activated','deactivated')),
  old_role text,
  new_role text,
  old_active boolean,
  new_active boolean,
  actor_user_id uuid,
  ip text,
  user_agent text
);

CREATE INDEX IF NOT EXISTS wma_workspace_created_idx
  ON public.workspace_member_audit (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wma_target_idx
  ON public.workspace_member_audit (target_user_id);

GRANT SELECT ON public.workspace_member_audit TO authenticated;
GRANT ALL ON public.workspace_member_audit TO service_role;

ALTER TABLE public.workspace_member_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wma_read" ON public.workspace_member_audit;
CREATE POLICY "wma_read"
  ON public.workspace_member_audit
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_workspace_admin(auth.uid(), workspace_id)
  );

CREATE OR REPLACE FUNCTION public.log_workspace_member_change()
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
    INSERT INTO public.workspace_member_audit
      (workspace_id, target_user_id, action, new_role, new_active, actor_user_id, ip, user_agent)
    VALUES
      (NEW.workspace_id, NEW.user_id, 'added', NEW.role::text, NEW.active, auth.uid(), v_ip, v_ua);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.workspace_member_audit
      (workspace_id, target_user_id, action, old_role, old_active, actor_user_id, ip, user_agent)
    VALUES
      (OLD.workspace_id, OLD.user_id, 'removed', OLD.role::text, OLD.active, auth.uid(), v_ip, v_ua);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      INSERT INTO public.workspace_member_audit
        (workspace_id, target_user_id, action, old_role, new_role, actor_user_id, ip, user_agent)
      VALUES
        (NEW.workspace_id, NEW.user_id, 'role_changed', OLD.role::text, NEW.role::text, auth.uid(), v_ip, v_ua);
    END IF;
    IF NEW.active IS DISTINCT FROM OLD.active THEN
      INSERT INTO public.workspace_member_audit
        (workspace_id, target_user_id, action, old_active, new_active, actor_user_id, ip, user_agent)
      VALUES
        (NEW.workspace_id, NEW.user_id,
         CASE WHEN NEW.active THEN 'activated' ELSE 'deactivated' END,
         OLD.active, NEW.active, auth.uid(), v_ip, v_ua);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_wm_audit_ins ON public.workspace_members;
DROP TRIGGER IF EXISTS trg_wm_audit_upd ON public.workspace_members;
DROP TRIGGER IF EXISTS trg_wm_audit_del ON public.workspace_members;

CREATE TRIGGER trg_wm_audit_ins
  AFTER INSERT ON public.workspace_members
  FOR EACH ROW EXECUTE FUNCTION public.log_workspace_member_change();

CREATE TRIGGER trg_wm_audit_upd
  AFTER UPDATE ON public.workspace_members
  FOR EACH ROW EXECUTE FUNCTION public.log_workspace_member_change();

CREATE TRIGGER trg_wm_audit_del
  AFTER DELETE ON public.workspace_members
  FOR EACH ROW EXECUTE FUNCTION public.log_workspace_member_change();
