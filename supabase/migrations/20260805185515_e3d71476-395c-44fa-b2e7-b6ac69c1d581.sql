
-- 1. Evolução do schema para suportar o novo contrato de dados
ALTER TABLE public.agent_runs ADD COLUMN IF NOT EXISTS structured_data jsonb;

-- 2. Expansão do meeting_analyses para alinhar com o prompt
ALTER TABLE public.meeting_analyses 
  ADD COLUMN IF NOT EXISTS briefing_used boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS analysis_completeness numeric(5,2),
  ADD COLUMN IF NOT EXISTS metadata jsonb; -- campo curinga para dados futuros

-- 3. Grant para service_role (usado pelo callback) e authenticated (usado pelo app)
GRANT ALL ON public.agent_runs TO service_role;
GRANT ALL ON public.meeting_analyses TO service_role;
GRANT SELECT, UPDATE ON public.agent_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.meeting_analyses TO authenticated;
