-- Restrict role assignment on user_roles: only super_admins may write.
-- This ensures the super_admin role (and any role) can't be granted client-side
-- except by an existing super_admin, enforcing the rule in the database rather
-- than trusting the UI.

DROP POLICY IF EXISTS "user_roles super_admin insert" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles super_admin update" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles super_admin delete" ON public.user_roles;

CREATE POLICY "user_roles super_admin insert"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "user_roles super_admin update"
  ON public.user_roles
  FOR UPDATE
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "user_roles super_admin delete"
  ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (public.is_super_admin(auth.uid()));
