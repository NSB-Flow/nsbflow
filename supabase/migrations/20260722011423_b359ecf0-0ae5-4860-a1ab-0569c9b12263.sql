
-- Fix A: agent_runs workspace scoping
DROP POLICY IF EXISTS "runs owner or admin read" ON public.agent_runs;
DROP POLICY IF EXISTS "runs owner update" ON public.agent_runs;
DROP POLICY IF EXISTS "runs owner delete" ON public.agent_runs;
DROP POLICY IF EXISTS "runs owner insert" ON public.agent_runs;

CREATE POLICY "runs workspace read" ON public.agent_runs
  FOR SELECT TO authenticated
  USING (
    public.is_workspace_member(auth.uid(), workspace_id)
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "runs owner or admin update" ON public.agent_runs
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = created_by
    OR public.is_workspace_admin(auth.uid(), workspace_id)
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    auth.uid() = created_by
    OR public.is_workspace_admin(auth.uid(), workspace_id)
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "runs owner or admin delete" ON public.agent_runs
  FOR DELETE TO authenticated
  USING (
    auth.uid() = created_by
    OR public.is_workspace_admin(auth.uid(), workspace_id)
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "runs workspace insert" ON public.agent_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND public.is_workspace_member(auth.uid(), workspace_id)
  );

-- Fix B: attachments workspace scoping — replace single ALL policy
DROP POLICY IF EXISTS "attachments owner all" ON public.attachments;

CREATE POLICY "attachments workspace read" ON public.attachments
  FOR SELECT TO authenticated
  USING (
    public.is_workspace_member(auth.uid(), workspace_id)
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "attachments workspace insert" ON public.attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND public.is_workspace_member(auth.uid(), workspace_id)
  );

CREATE POLICY "attachments owner or admin update" ON public.attachments
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = created_by
    OR public.is_workspace_admin(auth.uid(), workspace_id)
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    auth.uid() = created_by
    OR public.is_workspace_admin(auth.uid(), workspace_id)
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "attachments owner or admin delete" ON public.attachments
  FOR DELETE TO authenticated
  USING (
    auth.uid() = created_by
    OR public.is_workspace_admin(auth.uid(), workspace_id)
    OR public.is_super_admin(auth.uid())
  );

-- Fix C: companies UPDATE/DELETE scoped to workspace admin
DROP POLICY IF EXISTS "companies owner update" ON public.companies;
DROP POLICY IF EXISTS "companies owner delete" ON public.companies;
DROP POLICY IF EXISTS "companies auth insert" ON public.companies;

CREATE POLICY "companies workspace update" ON public.companies
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = created_by
    OR public.is_workspace_admin(auth.uid(), workspace_id)
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    auth.uid() = created_by
    OR public.is_workspace_admin(auth.uid(), workspace_id)
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "companies workspace delete" ON public.companies
  FOR DELETE TO authenticated
  USING (
    auth.uid() = created_by
    OR public.is_workspace_admin(auth.uid(), workspace_id)
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "companies workspace insert" ON public.companies
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND public.is_workspace_member(auth.uid(), workspace_id)
  );
