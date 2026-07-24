
-- 1) Extend companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS segment text,
  ADD COLUMN IF NOT EXISTS company_size text,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_company_size_check;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_company_size_check
  CHECK (company_size IS NULL OR company_size IN ('pequena','media','grande'));

CREATE INDEX IF NOT EXISTS idx_companies_assigned_to ON public.companies(assigned_to);

-- Tighten delete policy: only workspace admin or super admin (creator alone is no longer sufficient)
DROP POLICY IF EXISTS "companies workspace delete" ON public.companies;
CREATE POLICY "companies workspace delete"
  ON public.companies FOR DELETE
  TO authenticated
  USING (public.is_workspace_admin(auth.uid(), workspace_id) OR public.is_super_admin(auth.uid()));

-- 2) Opportunities
CREATE TABLE IF NOT EXISTS public.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_run_id uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta','em_andamento','proposta_enviada','ganha','perdida')),
  monthly_value numeric,
  total_contract_value numeric,
  contract_months integer,
  quantity integer,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_opportunities_company ON public.opportunities(company_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_workspace ON public.opportunities(workspace_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_status ON public.opportunities(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunities TO authenticated;
GRANT ALL ON public.opportunities TO service_role;

ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "opportunities workspace read"
  ON public.opportunities FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_super_admin(auth.uid()));

CREATE POLICY "opportunities workspace insert"
  ON public.opportunities FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by AND public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "opportunities workspace update"
  ON public.opportunities FOR UPDATE
  TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "opportunities workspace delete"
  ON public.opportunities FOR DELETE
  TO authenticated
  USING (public.is_workspace_admin(auth.uid(), workspace_id) OR public.is_super_admin(auth.uid()));

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_opportunities_updated ON public.opportunities;
CREATE TRIGGER trg_opportunities_updated
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-set closed_at when status transitions to ganha/perdida
CREATE OR REPLACE FUNCTION public.set_opportunity_closed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('ganha','perdida') THEN
    IF OLD IS NULL OR OLD.status IS DISTINCT FROM NEW.status THEN
      NEW.closed_at := now();
    END IF;
  ELSE
    NEW.closed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_opportunities_closed_at ON public.opportunities;
CREATE TRIGGER trg_opportunities_closed_at
  BEFORE INSERT OR UPDATE OF status ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.set_opportunity_closed_at();
