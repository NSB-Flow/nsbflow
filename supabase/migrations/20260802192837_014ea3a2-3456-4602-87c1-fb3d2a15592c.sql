CREATE TABLE public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  opportunity_id uuid REFERENCES public.opportunities(id),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  platform text NOT NULL CHECK (platform IN ('teams','zoom','google_meet')),
  meeting_link text NOT NULL,
  external_meeting_id text,
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','transcript_pending','transcript_ready','failed')),
  transcript_text text,
  transcript_fetched_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX meetings_workspace_idx ON public.meetings (workspace_id, scheduled_at DESC);
CREATE INDEX meetings_status_idx ON public.meetings (status, scheduled_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meetings TO authenticated;
GRANT ALL ON public.meetings TO service_role;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meetings hierarchical read" ON public.meetings
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    public.is_workspace_member(auth.uid(), workspace_id)
    AND public.can_view_user_scope(auth.uid(), created_by, workspace_id)
  )
);

CREATE POLICY "meetings insert own" ON public.meetings
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND public.is_workspace_member(auth.uid(), workspace_id)
);

CREATE POLICY "meetings update scoped" ON public.meetings
FOR UPDATE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    public.is_workspace_member(auth.uid(), workspace_id)
    AND (
      created_by = auth.uid()
      OR public.is_workspace_admin(auth.uid(), workspace_id)
      OR public.can_view_user_scope(auth.uid(), created_by, workspace_id)
    )
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    public.is_workspace_member(auth.uid(), workspace_id)
    AND (
      created_by = auth.uid()
      OR public.is_workspace_admin(auth.uid(), workspace_id)
      OR public.can_view_user_scope(auth.uid(), created_by, workspace_id)
    )
  )
);

CREATE POLICY "meetings delete admin" ON public.meetings
FOR DELETE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.is_workspace_admin(auth.uid(), workspace_id)
);

CREATE TRIGGER meetings_set_updated_at
BEFORE UPDATE ON public.meetings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.meeting_platform_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('microsoft','zoom','google')),
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  external_account_email text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active',
  last_error text,
  UNIQUE (user_id, provider)
);

GRANT ALL ON public.meeting_platform_connections TO service_role;
ALTER TABLE public.meeting_platform_connections ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER meeting_platform_connections_set_updated_at
BEFORE UPDATE ON public.meeting_platform_connections
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();