
CREATE TABLE public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  display_name text NOT NULL,
  description text,
  category text,
  min_plan text NOT NULL DEFAULT 'smart',
  is_active boolean NOT NULL DEFAULT true,
  n8n_webhook_url text,
  credit_cost integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.agents TO authenticated;
GRANT ALL ON public.agents TO service_role;

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agents_read_authenticated" ON public.agents
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "agents_super_admin_write" ON public.agents
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER agents_set_updated_at
  BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.agents (slug, display_name, description, category, min_plan, credit_cost) VALUES
  ('deap_briefing', 'Deap Briefing AI', 'Prepara o vendedor antes da reunião com um dossiê executivo do cliente.', 'deap_meeting', 'smart', 1),
  ('deap_intelligence', 'Deap Intelligence AI', 'Analisa a reunião realizada, cruzando transcrição, dados do cliente e briefing anterior.', 'deap_meeting', 'smart', 1);

ALTER TABLE public.agent_runs ADD COLUMN agent_id uuid REFERENCES public.agents(id);
CREATE INDEX IF NOT EXISTS agent_runs_agent_id_idx ON public.agent_runs(agent_id);
