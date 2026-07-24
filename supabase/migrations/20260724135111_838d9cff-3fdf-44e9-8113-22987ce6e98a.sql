
CREATE TABLE IF NOT EXISTS public.export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('role_audit', 'workspace_member_audit')),
  format text NOT NULL DEFAULT 'csv' CHECK (format IN ('csv')),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed','canceled')),
  total_rows integer,
  processed_rows integer DEFAULT 0,
  file_path text,
  file_size_bytes integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

GRANT SELECT, INSERT ON public.export_jobs TO authenticated;
GRANT ALL ON public.export_jobs TO service_role;

ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own export jobs" ON public.export_jobs;
CREATE POLICY "users read own export jobs" ON public.export_jobs
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users create own export jobs" ON public.export_jobs;
CREATE POLICY "users create own export jobs" ON public.export_jobs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_export_jobs_user_created
  ON public.export_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_jobs_status_created
  ON public.export_jobs (status, created_at) WHERE status IN ('queued','processing');

-- pg_cron fallback: drain the queue every minute even if the enqueue trigger was lost.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'drain-export-jobs') THEN
    PERFORM cron.unschedule('drain-export-jobs');
  END IF;
END $$;

SELECT cron.schedule(
  'drain-export-jobs',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--42ad62af-0035-432e-8662-c041ae8d0f8d.lovable.app/api/public/hooks/process-export-jobs',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
