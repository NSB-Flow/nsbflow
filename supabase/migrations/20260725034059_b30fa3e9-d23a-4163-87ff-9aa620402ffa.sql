
-- ============================================================
-- 1. Helpers
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_coordinator_or_above(_user_id uuid, _workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = _user_id AND workspace_id = _workspace_id AND active = true
      AND role IN ('super_admin','admin','admin_empresa','ceo','diretor','gerente','coordenador')
  ) OR public.is_super_admin(_user_id)
$$;

REVOKE EXECUTE ON FUNCTION public.is_coordinator_or_above(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_coordinator_or_above(uuid, uuid) TO authenticated, service_role;

-- ============================================================
-- 2. user_reports_to
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_reports_to (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  manager_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, manager_id, workspace_id),
  CHECK (user_id <> manager_id)
);

CREATE INDEX IF NOT EXISTS idx_urt_manager ON public.user_reports_to (manager_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_urt_user ON public.user_reports_to (user_id, workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_reports_to TO authenticated;
GRANT ALL ON public.user_reports_to TO service_role;

ALTER TABLE public.user_reports_to ENABLE ROW LEVEL SECURITY;

CREATE POLICY "urt workspace read"
  ON public.user_reports_to FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_super_admin(auth.uid()));

CREATE POLICY "urt coordinator insert"
  ON public.user_reports_to FOR INSERT
  WITH CHECK (public.is_coordinator_or_above(auth.uid(), workspace_id));

CREATE POLICY "urt coordinator update"
  ON public.user_reports_to FOR UPDATE
  USING (public.is_coordinator_or_above(auth.uid(), workspace_id))
  WITH CHECK (public.is_coordinator_or_above(auth.uid(), workspace_id));

CREATE POLICY "urt coordinator delete"
  ON public.user_reports_to FOR DELETE
  USING (public.is_coordinator_or_above(auth.uid(), workspace_id));

-- ============================================================
-- 3. get_subordinates (recursive)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_subordinates(p_manager_id uuid, p_workspace_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE hierarchy AS (
    SELECT user_id FROM public.user_reports_to
     WHERE manager_id = p_manager_id AND workspace_id = p_workspace_id
    UNION
    SELECT urt.user_id FROM public.user_reports_to urt
    INNER JOIN hierarchy h ON urt.manager_id = h.user_id
     WHERE urt.workspace_id = p_workspace_id
  )
  SELECT user_id FROM hierarchy;
$$;

REVOKE EXECUTE ON FUNCTION public.get_subordinates(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_subordinates(uuid, uuid) TO authenticated, service_role;

-- Convenience: viewer can see target user's data?
CREATE OR REPLACE FUNCTION public.can_view_user_scope(_viewer uuid, _target uuid, _workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _viewer = _target
    OR public.is_super_admin(_viewer)
    OR public.is_workspace_admin(_viewer, _workspace_id)
    OR EXISTS (
      SELECT 1 FROM public.get_subordinates(_viewer, _workspace_id) s
      WHERE s = _target
    );
$$;

REVOKE EXECUTE ON FUNCTION public.can_view_user_scope(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_user_scope(uuid, uuid, uuid) TO authenticated, service_role;

-- ============================================================
-- 4. account_assignments
-- ============================================================

CREATE TABLE IF NOT EXISTS public.account_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_in_account text NOT NULL,
  assigned_by uuid NOT NULL REFERENCES auth.users(id),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id, role_in_account)
);

CREATE INDEX IF NOT EXISTS idx_aa_company ON public.account_assignments (company_id);
CREATE INDEX IF NOT EXISTS idx_aa_user ON public.account_assignments (user_id, workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_assignments TO authenticated;
GRANT ALL ON public.account_assignments TO service_role;

ALTER TABLE public.account_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aa hierarchical read"
  ON public.account_assignments FOR SELECT
  USING (
    public.is_workspace_member(auth.uid(), workspace_id)
    AND public.can_view_user_scope(auth.uid(), user_id, workspace_id)
  );

CREATE POLICY "aa coordinator insert"
  ON public.account_assignments FOR INSERT
  WITH CHECK (
    public.is_coordinator_or_above(auth.uid(), workspace_id)
    AND assigned_by = auth.uid()
  );

CREATE POLICY "aa coordinator delete"
  ON public.account_assignments FOR DELETE
  USING (public.is_coordinator_or_above(auth.uid(), workspace_id));

-- Sync companies.assigned_to whenever a vendedor_principal is set
CREATE OR REPLACE FUNCTION public.sync_company_primary_assignee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.role_in_account = 'vendedor_principal' THEN
    UPDATE public.companies SET assigned_to = NEW.user_id WHERE id = NEW.company_id;
  ELSIF TG_OP = 'DELETE' AND OLD.role_in_account = 'vendedor_principal' THEN
    UPDATE public.companies SET assigned_to = NULL
      WHERE id = OLD.company_id AND assigned_to = OLD.user_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_aa_sync_primary ON public.account_assignments;
CREATE TRIGGER trg_aa_sync_primary
AFTER INSERT OR DELETE ON public.account_assignments
FOR EACH ROW EXECUTE FUNCTION public.sync_company_primary_assignee();

-- ============================================================
-- 5. Hierarchical visibility on existing tables
-- ============================================================

-- companies: replace SELECT to require ownership OR subordinate ownership OR admin.
DROP POLICY IF EXISTS "companies workspace read" ON public.companies;
CREATE POLICY "companies hierarchical read"
  ON public.companies FOR SELECT
  USING (
    public.is_workspace_member(auth.uid(), workspace_id)
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_workspace_admin(auth.uid(), workspace_id)
      OR created_by = auth.uid()
      OR assigned_to = auth.uid()
      OR (created_by IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.get_subordinates(auth.uid(), workspace_id) s WHERE s = created_by
      ))
      OR (assigned_to IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.get_subordinates(auth.uid(), workspace_id) s WHERE s = assigned_to
      ))
      OR EXISTS (
        SELECT 1 FROM public.account_assignments aa
         WHERE aa.company_id = companies.id
           AND (aa.user_id = auth.uid()
                OR aa.user_id IN (SELECT s FROM public.get_subordinates(auth.uid(), workspace_id) s))
      )
    )
  );

-- opportunities: created_by scoped
DROP POLICY IF EXISTS "opportunities workspace read" ON public.opportunities;
CREATE POLICY "opportunities hierarchical read"
  ON public.opportunities FOR SELECT
  USING (
    public.is_workspace_member(auth.uid(), workspace_id)
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_workspace_admin(auth.uid(), workspace_id)
      OR created_by = auth.uid()
      OR (created_by IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.get_subordinates(auth.uid(), workspace_id) s WHERE s = created_by
      ))
      OR EXISTS (
        SELECT 1 FROM public.companies c
         WHERE c.id = opportunities.company_id
           AND (c.assigned_to = auth.uid()
                OR (c.assigned_to IS NOT NULL AND c.assigned_to IN (
                     SELECT s FROM public.get_subordinates(auth.uid(), workspace_id) s
                   )))
      )
    )
  );

-- agent_runs: created_by scoped
DROP POLICY IF EXISTS "runs workspace read" ON public.agent_runs;
CREATE POLICY "runs hierarchical read"
  ON public.agent_runs FOR SELECT
  USING (
    public.is_workspace_member(auth.uid(), workspace_id)
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_workspace_admin(auth.uid(), workspace_id)
      OR created_by = auth.uid()
      OR (created_by IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.get_subordinates(auth.uid(), workspace_id) s WHERE s = created_by
      ))
    )
  );

-- meeting_analyses: inherits from company visibility
DROP POLICY IF EXISTS "workspace members can read meeting_analyses" ON public.meeting_analyses;
CREATE POLICY "meeting_analyses hierarchical read"
  ON public.meeting_analyses FOR SELECT
  USING (
    public.is_workspace_member(auth.uid(), workspace_id)
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_workspace_admin(auth.uid(), workspace_id)
      OR EXISTS (
        SELECT 1 FROM public.companies c
         WHERE c.id = meeting_analyses.company_id
           AND (
             c.created_by = auth.uid() OR c.assigned_to = auth.uid()
             OR (c.created_by IS NOT NULL AND c.created_by IN (
                  SELECT s FROM public.get_subordinates(auth.uid(), workspace_id) s))
             OR (c.assigned_to IS NOT NULL AND c.assigned_to IN (
                  SELECT s FROM public.get_subordinates(auth.uid(), workspace_id) s))
           )
      )
      OR EXISTS (
        SELECT 1 FROM public.account_assignments aa
         WHERE aa.company_id = meeting_analyses.company_id
           AND (aa.user_id = auth.uid()
                OR aa.user_id IN (SELECT s FROM public.get_subordinates(auth.uid(), workspace_id) s))
      )
    )
  );

-- profiles: managers can read subordinate profiles; admins can read any workspace member.
CREATE POLICY "profiles hierarchical read"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
       WHERE wm.user_id = profiles.id
         AND wm.active = true
         AND public.is_workspace_member(auth.uid(), wm.workspace_id)
         AND public.can_view_user_scope(auth.uid(), profiles.id, wm.workspace_id)
    )
  );
