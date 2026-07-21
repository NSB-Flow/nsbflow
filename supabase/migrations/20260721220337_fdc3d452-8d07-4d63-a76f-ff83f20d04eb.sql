
-- plan_features: restrict read to authenticated (active plans only)
DROP POLICY IF EXISTS pf_read ON public.plan_features;
CREATE POLICY pf_read ON public.plan_features
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.plans p WHERE p.id = plan_features.plan_id AND p.active = true));
REVOKE SELECT ON public.plan_features FROM anon;

-- workspace_members: prevent self-insert privilege escalation. Only workspace admins/super admins may add members. Self-insertion is allowed only when the user owns the workspace (bootstrap of a new workspace).
DROP POLICY IF EXISTS wm_insert ON public.workspace_members;
CREATE POLICY wm_insert ON public.workspace_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_workspace_admin(auth.uid(), workspace_id)
    OR public.is_super_admin(auth.uid())
    OR (
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.workspaces w
        WHERE w.id = workspace_id AND w.owner_user_id = auth.uid()
      )
    )
  );

-- companies: ensure no legacy permissive read policy exists; keep only workspace-scoped read.
DROP POLICY IF EXISTS "companies auth read" ON public.companies;
