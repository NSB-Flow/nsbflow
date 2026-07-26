
-- meeting_analyses: restrict UPDATE to hierarchical scope
DROP POLICY IF EXISTS "workspace members can update meeting_analyses" ON public.meeting_analyses;
CREATE POLICY "meeting_analyses hierarchical update"
ON public.meeting_analyses
FOR UPDATE
USING (
  is_workspace_member(auth.uid(), workspace_id) AND (
    is_super_admin(auth.uid())
    OR is_workspace_admin(auth.uid(), workspace_id)
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = meeting_analyses.company_id
        AND (
          c.created_by = auth.uid()
          OR c.assigned_to = auth.uid()
          OR (c.created_by IS NOT NULL AND c.created_by IN (SELECT s.s FROM get_subordinates(auth.uid(), c.workspace_id) s(s)))
          OR (c.assigned_to IS NOT NULL AND c.assigned_to IN (SELECT s.s FROM get_subordinates(auth.uid(), c.workspace_id) s(s)))
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.account_assignments aa
      WHERE aa.company_id = meeting_analyses.company_id
        AND (
          aa.user_id = auth.uid()
          OR aa.user_id IN (SELECT s.s FROM get_subordinates(auth.uid(), aa.workspace_id) s(s))
        )
    )
  )
)
WITH CHECK (
  is_workspace_member(auth.uid(), workspace_id) AND (
    is_super_admin(auth.uid())
    OR is_workspace_admin(auth.uid(), workspace_id)
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = meeting_analyses.company_id
        AND (
          c.created_by = auth.uid()
          OR c.assigned_to = auth.uid()
          OR (c.created_by IS NOT NULL AND c.created_by IN (SELECT s.s FROM get_subordinates(auth.uid(), c.workspace_id) s(s)))
          OR (c.assigned_to IS NOT NULL AND c.assigned_to IN (SELECT s.s FROM get_subordinates(auth.uid(), c.workspace_id) s(s)))
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.account_assignments aa
      WHERE aa.company_id = meeting_analyses.company_id
        AND (
          aa.user_id = auth.uid()
          OR aa.user_id IN (SELECT s.s FROM get_subordinates(auth.uid(), aa.workspace_id) s(s))
        )
    )
  )
);

-- nps_surveys: restrict UPDATE to hierarchical scope
DROP POLICY IF EXISTS "nps_surveys workspace members update" ON public.nps_surveys;
CREATE POLICY "nps_surveys hierarchical update"
ON public.nps_surveys
FOR UPDATE
USING (
  is_workspace_member(auth.uid(), workspace_id) AND (
    is_super_admin(auth.uid())
    OR is_workspace_admin(auth.uid(), workspace_id)
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = nps_surveys.company_id
        AND (
          c.created_by = auth.uid()
          OR c.assigned_to = auth.uid()
          OR (c.created_by IS NOT NULL AND c.created_by IN (SELECT s.s FROM get_subordinates(auth.uid(), c.workspace_id) s(s)))
          OR (c.assigned_to IS NOT NULL AND c.assigned_to IN (SELECT s.s FROM get_subordinates(auth.uid(), c.workspace_id) s(s)))
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.account_assignments aa
      WHERE aa.company_id = nps_surveys.company_id
        AND (
          aa.user_id = auth.uid()
          OR aa.user_id IN (SELECT s.s FROM get_subordinates(auth.uid(), aa.workspace_id) s(s))
        )
    )
  )
)
WITH CHECK (
  is_workspace_member(auth.uid(), workspace_id) AND (
    is_super_admin(auth.uid())
    OR is_workspace_admin(auth.uid(), workspace_id)
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = nps_surveys.company_id
        AND (
          c.created_by = auth.uid()
          OR c.assigned_to = auth.uid()
          OR (c.created_by IS NOT NULL AND c.created_by IN (SELECT s.s FROM get_subordinates(auth.uid(), c.workspace_id) s(s)))
          OR (c.assigned_to IS NOT NULL AND c.assigned_to IN (SELECT s.s FROM get_subordinates(auth.uid(), c.workspace_id) s(s)))
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.account_assignments aa
      WHERE aa.company_id = nps_surveys.company_id
        AND (
          aa.user_id = auth.uid()
          OR aa.user_id IN (SELECT s.s FROM get_subordinates(auth.uid(), aa.workspace_id) s(s))
        )
    )
  )
);

-- opportunities: restrict UPDATE to owner/assignee/subordinate/admin
DROP POLICY IF EXISTS "opportunities workspace update" ON public.opportunities;
CREATE POLICY "opportunities hierarchical update"
ON public.opportunities
FOR UPDATE
USING (
  is_workspace_member(auth.uid(), workspace_id) AND (
    is_super_admin(auth.uid())
    OR is_workspace_admin(auth.uid(), workspace_id)
    OR created_by = auth.uid()
    OR (created_by IS NOT NULL AND EXISTS (
      SELECT 1 FROM get_subordinates(auth.uid(), opportunities.workspace_id) s(s)
      WHERE s.s = opportunities.created_by
    ))
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = opportunities.company_id
        AND (
          c.assigned_to = auth.uid()
          OR (c.assigned_to IS NOT NULL AND c.assigned_to IN (SELECT s.s FROM get_subordinates(auth.uid(), c.workspace_id) s(s)))
        )
    )
  )
)
WITH CHECK (
  is_workspace_member(auth.uid(), workspace_id) AND (
    is_super_admin(auth.uid())
    OR is_workspace_admin(auth.uid(), workspace_id)
    OR created_by = auth.uid()
    OR (created_by IS NOT NULL AND EXISTS (
      SELECT 1 FROM get_subordinates(auth.uid(), opportunities.workspace_id) s(s)
      WHERE s.s = opportunities.created_by
    ))
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = opportunities.company_id
        AND (
          c.assigned_to = auth.uid()
          OR (c.assigned_to IS NOT NULL AND c.assigned_to IN (SELECT s.s FROM get_subordinates(auth.uid(), c.workspace_id) s(s)))
        )
    )
  )
);
