
CREATE TABLE public.user_role_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  action text NOT NULL CHECK (action IN ('granted','revoked')),
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_role_audit_created_at_idx ON public.user_role_audit (created_at DESC);
CREATE INDEX user_role_audit_target_idx ON public.user_role_audit (target_user_id);

GRANT SELECT ON public.user_role_audit TO authenticated;
GRANT ALL ON public.user_role_audit TO service_role;

ALTER TABLE public.user_role_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_role_audit super_admin read"
  ON public.user_role_audit
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.log_user_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.user_role_audit (target_user_id, role, action, actor_user_id)
    VALUES (NEW.user_id, NEW.role, 'granted', auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.user_role_audit (target_user_id, role, action, actor_user_id)
    VALUES (OLD.user_id, OLD.role, 'revoked', auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER user_roles_audit_ins
  AFTER INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.log_user_role_change();

CREATE TRIGGER user_roles_audit_del
  AFTER DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.log_user_role_change();
