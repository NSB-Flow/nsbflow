
-- Scope companies SELECT to workspace members
DROP POLICY IF EXISTS "companies auth read" ON public.companies;
CREATE POLICY "companies workspace read" ON public.companies
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.has_role(auth.uid(), 'admin'::app_role));

-- Revoke public/authenticated EXECUTE on SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.referral_code_exists(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_workspace_admin(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
