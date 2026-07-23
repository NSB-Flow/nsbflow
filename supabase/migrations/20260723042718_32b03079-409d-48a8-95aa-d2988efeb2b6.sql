
-- Fix: companies_cross_tenant_read — drop global admin bypass on SELECT
DROP POLICY IF EXISTS "companies workspace read" ON public.companies;
CREATE POLICY "companies workspace read" ON public.companies
FOR SELECT TO authenticated
USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_super_admin(auth.uid()));

-- Fix: plan_features_pf_read_restrictive_note — allow authenticated users to read features of active plans
DROP POLICY IF EXISTS "pf_read" ON public.plan_features;
CREATE POLICY "pf_read" ON public.plan_features
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR EXISTS (SELECT 1 FROM public.plans p WHERE p.id = plan_features.plan_id AND p.active = true)
);

-- Fix: workspace_members_wm_insert_self_role — remove client-side owner self-insert branch
DROP POLICY IF EXISTS "wm_insert" ON public.workspace_members;
CREATE POLICY "wm_insert" ON public.workspace_members
FOR INSERT TO authenticated
WITH CHECK (
  public.is_workspace_admin(auth.uid(), workspace_id)
  OR public.is_super_admin(auth.uid())
);

-- Fix: SUPA_authenticated_security_definer_function_executable —
-- convert membership check helpers to SECURITY INVOKER. RLS on user_roles
-- and workspace_members already permits users to read their own rows, so
-- calls like is_workspace_member(auth.uid(), ws) still resolve correctly.
ALTER FUNCTION public.is_super_admin(uuid) SECURITY INVOKER;
ALTER FUNCTION public.is_workspace_admin(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.is_workspace_member(uuid, uuid) SECURITY INVOKER;
