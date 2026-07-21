
-- plan_features: restrict read to super admins only
DROP POLICY IF EXISTS pf_read ON public.plan_features;
CREATE POLICY pf_read ON public.plan_features
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

REVOKE SELECT ON public.plan_features FROM anon;

-- workspace_members: prevent self-insert with arbitrary role/workspace
DROP POLICY IF EXISTS wm_insert ON public.workspace_members;
CREATE POLICY wm_insert ON public.workspace_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_workspace_admin(auth.uid(), workspace_id)
    OR public.is_super_admin(auth.uid())
    OR (
      user_id = auth.uid()
      AND role = 'admin_empresa'
      AND EXISTS (
        SELECT 1 FROM public.workspaces w
        WHERE w.id = workspace_members.workspace_id
          AND w.owner_user_id = auth.uid()
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.workspace_members wm
        WHERE wm.workspace_id = workspace_members.workspace_id
      )
    )
  );
