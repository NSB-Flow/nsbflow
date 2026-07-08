
-- Revoke public execute
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- Endurecer WITH CHECK
DROP POLICY "companies owner update" ON public.companies;
CREATE POLICY "companies owner update" ON public.companies FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'));

DROP POLICY "runs owner update" ON public.agent_runs;
CREATE POLICY "runs owner update" ON public.agent_runs FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'));

-- Storage policies para bucket agent-uploads
CREATE POLICY "agent-uploads owner read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'agent-uploads' AND owner = auth.uid());
CREATE POLICY "agent-uploads owner insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'agent-uploads' AND owner = auth.uid());
CREATE POLICY "agent-uploads owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'agent-uploads' AND owner = auth.uid());
