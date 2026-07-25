-- 1) Revoke PUBLIC EXECUTE on trigger function (SECURITY DEFINER)
REVOKE EXECUTE ON FUNCTION public.sync_company_primary_assignee() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_company_primary_assignee() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_company_primary_assignee() FROM authenticated;

-- 2) Hide agents.n8n_webhook_url from authenticated/anon via column-level privileges
-- Replace broad authenticated SELECT policy with one that excludes the webhook column via column grants.
REVOKE SELECT ON public.agents FROM authenticated;
REVOKE SELECT ON public.agents FROM anon;

GRANT SELECT (id, slug, display_name, description, category, min_plan, is_active, credit_cost, created_at, updated_at)
  ON public.agents TO authenticated;
