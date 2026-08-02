DROP POLICY IF EXISTS "companies hierarchical read" ON public.companies;
CREATE POLICY "companies hierarchical read" ON public.companies
FOR SELECT TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    is_workspace_member(auth.uid(), workspace_id) AND (
      is_workspace_admin(auth.uid(), workspace_id)
      OR created_by = auth.uid()
      OR assigned_to = auth.uid()
      OR (created_by IS NOT NULL AND EXISTS (SELECT 1 FROM get_subordinates(auth.uid(), companies.workspace_id) s(s) WHERE s.s = companies.created_by))
      OR (assigned_to IS NOT NULL AND EXISTS (SELECT 1 FROM get_subordinates(auth.uid(), companies.workspace_id) s(s) WHERE s.s = companies.assigned_to))
      OR EXISTS (
        SELECT 1 FROM account_assignments aa
        WHERE aa.company_id = companies.id
          AND (aa.user_id = auth.uid() OR aa.user_id IN (SELECT s.s FROM get_subordinates(auth.uid(), aa.workspace_id) s(s)))
      )
    )
  )
);