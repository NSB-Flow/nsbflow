-- 1. Branding columns on workspaces
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS branding_logo_url text,
  ADD COLUMN IF NOT EXISTS branding_company_name text;

-- 2. Storage policies for workspace-logos bucket
-- Path convention: <workspace_id>/<filename>

DROP POLICY IF EXISTS "workspace-logos read (members)" ON storage.objects;
CREATE POLICY "workspace-logos read (members)"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'workspace-logos'
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_workspace_member(auth.uid(), (split_part(name, '/', 1))::uuid)
    )
  );

DROP POLICY IF EXISTS "workspace-logos insert (admins)" ON storage.objects;
CREATE POLICY "workspace-logos insert (admins)"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'workspace-logos'
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_workspace_admin(auth.uid(), (split_part(name, '/', 1))::uuid)
    )
  );

DROP POLICY IF EXISTS "workspace-logos update (admins)" ON storage.objects;
CREATE POLICY "workspace-logos update (admins)"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'workspace-logos'
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_workspace_admin(auth.uid(), (split_part(name, '/', 1))::uuid)
    )
  )
  WITH CHECK (
    bucket_id = 'workspace-logos'
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_workspace_admin(auth.uid(), (split_part(name, '/', 1))::uuid)
    )
  );

DROP POLICY IF EXISTS "workspace-logos delete (admins)" ON storage.objects;
CREATE POLICY "workspace-logos delete (admins)"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'workspace-logos'
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_workspace_admin(auth.uid(), (split_part(name, '/', 1))::uuid)
    )
  );