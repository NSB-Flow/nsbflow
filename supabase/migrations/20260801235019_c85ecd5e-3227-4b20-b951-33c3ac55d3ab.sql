ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS parent_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS companies_parent_company_id_idx ON public.companies(parent_company_id);

CREATE OR REPLACE FUNCTION public.validate_company_parent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_parent_ws uuid;
  v_cursor uuid;
  v_depth int := 0;
BEGIN
  IF NEW.parent_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_company_id = NEW.id THEN
    RAISE EXCEPTION 'Uma empresa não pode ser a matriz de si mesma.';
  END IF;

  SELECT workspace_id INTO v_parent_ws FROM public.companies WHERE id = NEW.parent_company_id;
  IF v_parent_ws IS NULL THEN
    RAISE EXCEPTION 'Empresa-mãe não encontrada.';
  END IF;
  IF v_parent_ws IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION 'A empresa-mãe precisa pertencer ao mesmo workspace.';
  END IF;

  v_cursor := NEW.parent_company_id;
  WHILE v_cursor IS NOT NULL AND v_depth < 50 LOOP
    IF v_cursor = NEW.id THEN
      RAISE EXCEPTION 'Referência circular de grupo econômico não é permitida.';
    END IF;
    SELECT parent_company_id INTO v_cursor FROM public.companies WHERE id = v_cursor;
    v_depth := v_depth + 1;
  END LOOP;

  IF v_depth >= 50 THEN
    RAISE EXCEPTION 'Hierarquia de grupo econômico muito profunda.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_company_parent() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS validate_company_parent_trg ON public.companies;
CREATE TRIGGER validate_company_parent_trg
BEFORE INSERT OR UPDATE OF parent_company_id, workspace_id ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.validate_company_parent();