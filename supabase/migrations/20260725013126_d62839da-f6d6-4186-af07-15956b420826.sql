
CREATE TABLE public.meeting_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  meeting_score numeric,
  opportunity_score integer,
  nps_estimate integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_meeting_analyses_company ON public.meeting_analyses(company_id);
CREATE INDEX idx_meeting_analyses_workspace ON public.meeting_analyses(workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_analyses TO authenticated;
GRANT ALL ON public.meeting_analyses TO service_role;

ALTER TABLE public.meeting_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members can read meeting_analyses"
  ON public.meeting_analyses FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_super_admin(auth.uid()));

CREATE POLICY "workspace members can insert meeting_analyses"
  ON public.meeting_analyses FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "workspace members can update meeting_analyses"
  ON public.meeting_analyses FOR UPDATE TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "workspace admins can delete meeting_analyses"
  ON public.meeting_analyses FOR DELETE TO authenticated
  USING (public.is_workspace_admin(auth.uid(), workspace_id) OR public.is_super_admin(auth.uid()));
