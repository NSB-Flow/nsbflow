DROP POLICY IF EXISTS "settings admin read" ON public.app_settings;
DROP POLICY IF EXISTS "settings admin write" ON public.app_settings;

CREATE POLICY "settings super admin read" ON public.app_settings
FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "settings super admin write" ON public.app_settings
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));