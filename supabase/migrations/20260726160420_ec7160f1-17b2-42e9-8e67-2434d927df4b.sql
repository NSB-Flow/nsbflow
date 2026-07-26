
CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX idx_api_keys_workspace ON public.api_keys(workspace_id);
CREATE INDEX idx_api_keys_hash ON public.api_keys(key_hash) WHERE revoked_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_keys_admin_select" ON public.api_keys
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_workspace_admin(auth.uid(), workspace_id)
  );

CREATE POLICY "api_keys_admin_update" ON public.api_keys
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_workspace_admin(auth.uid(), workspace_id)
  );

CREATE POLICY "api_keys_admin_delete" ON public.api_keys
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_workspace_admin(auth.uid(), workspace_id)
  );

-- INSERT only via service role (server function) so key_hash is never
-- provided by the client
