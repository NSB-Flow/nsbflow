
CREATE TABLE public.nps_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  score integer CHECK (score IS NULL OR (score >= 0 AND score <= 10)),
  sent_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','responded','expired')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_nps_surveys_company ON public.nps_surveys(company_id);
CREATE INDEX idx_nps_surveys_workspace ON public.nps_surveys(workspace_id);
CREATE INDEX idx_nps_surveys_responded ON public.nps_surveys(company_id, responded_at DESC) WHERE status = 'responded';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nps_surveys TO authenticated;
GRANT ALL ON public.nps_surveys TO service_role;

ALTER TABLE public.nps_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nps_surveys hierarchical read"
ON public.nps_surveys FOR SELECT
USING (
  is_workspace_member(auth.uid(), workspace_id) AND (
    is_super_admin(auth.uid())
    OR is_workspace_admin(auth.uid(), workspace_id)
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = nps_surveys.company_id AND (
        c.created_by = auth.uid()
        OR c.assigned_to = auth.uid()
        OR (c.created_by IS NOT NULL AND c.created_by IN (SELECT s FROM get_subordinates(auth.uid(), c.workspace_id) s))
        OR (c.assigned_to IS NOT NULL AND c.assigned_to IN (SELECT s FROM get_subordinates(auth.uid(), c.workspace_id) s))
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.account_assignments aa
      WHERE aa.company_id = nps_surveys.company_id AND (
        aa.user_id = auth.uid()
        OR aa.user_id IN (SELECT s FROM get_subordinates(auth.uid(), aa.workspace_id) s)
      )
    )
  )
);

CREATE POLICY "nps_surveys workspace members insert"
ON public.nps_surveys FOR INSERT
WITH CHECK (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "nps_surveys workspace members update"
ON public.nps_surveys FOR UPDATE
USING (is_workspace_member(auth.uid(), workspace_id))
WITH CHECK (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "nps_surveys workspace admins delete"
ON public.nps_surveys FOR DELETE
USING (is_workspace_admin(auth.uid(), workspace_id) OR is_super_admin(auth.uid()));
