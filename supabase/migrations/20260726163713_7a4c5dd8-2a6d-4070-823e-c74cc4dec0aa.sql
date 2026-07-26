
CREATE TABLE public.workspace_branding_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  old_logo_url text,
  new_logo_url text,
  old_company_name text,
  new_company_name text,
  actor_user_id uuid,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wba_workspace_created ON public.workspace_branding_audit(workspace_id, created_at DESC);

GRANT SELECT ON public.workspace_branding_audit TO authenticated;
GRANT ALL ON public.workspace_branding_audit TO service_role;

ALTER TABLE public.workspace_branding_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wba_select_admins" ON public.workspace_branding_audit
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_workspace_admin(auth.uid(), workspace_id)
  );

CREATE OR REPLACE FUNCTION public.log_workspace_branding_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_headers json;
  v_ip text;
  v_ua text;
BEGIN
  IF NEW.branding_logo_url IS NOT DISTINCT FROM OLD.branding_logo_url
     AND NEW.branding_company_name IS NOT DISTINCT FROM OLD.branding_company_name THEN
    RETURN NEW;
  END IF;

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

  INSERT INTO public.workspace_branding_audit
    (workspace_id, old_logo_url, new_logo_url, old_company_name, new_company_name, actor_user_id, ip, user_agent)
  VALUES
    (NEW.id, OLD.branding_logo_url, NEW.branding_logo_url,
     OLD.branding_company_name, NEW.branding_company_name,
     auth.uid(), v_ip, v_ua);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_workspace_branding_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_log_workspace_branding_change ON public.workspaces;
CREATE TRIGGER trg_log_workspace_branding_change
AFTER UPDATE OF branding_logo_url, branding_company_name ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.log_workspace_branding_change();
