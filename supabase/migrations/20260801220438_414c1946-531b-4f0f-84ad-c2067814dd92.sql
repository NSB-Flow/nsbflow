-- =========================
-- CRM Integration (Salesforce)
-- =========================

CREATE TABLE public.crm_connections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider      text NOT NULL DEFAULT 'salesforce',
  access_token  text,
  refresh_token text,
  instance_url  text,
  token_expires_at timestamptz,
  connected_by  uuid NOT NULL REFERENCES auth.users(id),
  connected_at  timestamptz NOT NULL DEFAULT now(),
  last_sync_at  timestamptz,
  status        text NOT NULL DEFAULT 'active',
  last_error    text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider)
);

-- Tokens are server-only: no anon/authenticated grants at all.
GRANT ALL ON public.crm_connections TO service_role;
ALTER TABLE public.crm_connections ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER crm_connections_updated_at
  BEFORE UPDATE ON public.crm_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.crm_field_mappings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider       text NOT NULL DEFAULT 'salesforce',
  nsb_object     text NOT NULL CHECK (nsb_object IN ('company','opportunity')),
  nsb_field      text NOT NULL,
  crm_object     text NOT NULL,
  crm_field      text NOT NULL,
  sync_direction text NOT NULL DEFAULT 'both' CHECK (sync_direction IN ('both','to_crm','from_crm')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider, nsb_object, nsb_field)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_field_mappings TO authenticated;
GRANT ALL ON public.crm_field_mappings TO service_role;
ALTER TABLE public.crm_field_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cfm_select_members" ON public.crm_field_mappings
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "cfm_insert_admins" ON public.crm_field_mappings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_workspace_admin(auth.uid(), workspace_id));

CREATE POLICY "cfm_update_admins" ON public.crm_field_mappings
  FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_workspace_admin(auth.uid(), workspace_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_workspace_admin(auth.uid(), workspace_id));

CREATE POLICY "cfm_delete_admins" ON public.crm_field_mappings
  FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_workspace_admin(auth.uid(), workspace_id));

CREATE TABLE public.crm_sync_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  direction     text NOT NULL CHECK (direction IN ('to_crm','from_crm')),
  nsb_object    text NOT NULL,
  nsb_record_id uuid,
  crm_record_id text,
  status        text NOT NULL CHECK (status IN ('success','error','conflict_resolved')),
  detail        text,
  synced_at     timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.crm_sync_log TO authenticated;
GRANT ALL ON public.crm_sync_log TO service_role;
ALTER TABLE public.crm_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "csl_select_members" ON public.crm_sync_log
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE INDEX crm_sync_log_ws_time_idx ON public.crm_sync_log (workspace_id, synced_at DESC);

-- Link columns
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS salesforce_id text;
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS salesforce_id text;

CREATE UNIQUE INDEX companies_salesforce_id_uidx
  ON public.companies (workspace_id, salesforce_id) WHERE salesforce_id IS NOT NULL;
CREATE UNIQUE INDEX opportunities_salesforce_id_uidx
  ON public.opportunities (workspace_id, salesforce_id) WHERE salesforce_id IS NOT NULL;