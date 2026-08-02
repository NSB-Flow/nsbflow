-- 1) crm_connections: explicit fail-closed. All legitimate access is server-side (service role).
REVOKE ALL ON public.crm_connections FROM anon, authenticated;
GRANT ALL ON public.crm_connections TO service_role;

DROP POLICY IF EXISTS "crm_connections no direct select" ON public.crm_connections;
DROP POLICY IF EXISTS "crm_connections no direct insert" ON public.crm_connections;
DROP POLICY IF EXISTS "crm_connections no direct update" ON public.crm_connections;
DROP POLICY IF EXISTS "crm_connections no direct delete" ON public.crm_connections;

CREATE POLICY "crm_connections no direct select" ON public.crm_connections
  FOR SELECT TO anon, authenticated USING (false);
CREATE POLICY "crm_connections no direct insert" ON public.crm_connections
  FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "crm_connections no direct update" ON public.crm_connections
  FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "crm_connections no direct delete" ON public.crm_connections
  FOR DELETE TO anon, authenticated USING (false);

-- 2) audit-exports bucket: owner-scoped policies. Files live at <user_id>/<job_id>.csv
DROP POLICY IF EXISTS "audit exports read own" ON storage.objects;
DROP POLICY IF EXISTS "audit exports insert own" ON storage.objects;
DROP POLICY IF EXISTS "audit exports update own" ON storage.objects;
DROP POLICY IF EXISTS "audit exports delete own" ON storage.objects;

CREATE POLICY "audit exports read own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'audit-exports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "audit exports insert own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'audit-exports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "audit exports update own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'audit-exports' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'audit-exports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "audit exports delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'audit-exports' AND (storage.foldername(name))[1] = auth.uid()::text);