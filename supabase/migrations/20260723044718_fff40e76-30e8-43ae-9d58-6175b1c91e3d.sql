
-- 1) companies: strict workspace membership (remove super_admin bypass)
DROP POLICY IF EXISTS "companies workspace read" ON public.companies;
CREATE POLICY "companies workspace read" ON public.companies
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

-- 2) plan_features: limit to user's own subscribed plan or super admin
DROP POLICY IF EXISTS pf_read ON public.plan_features;
CREATE POLICY pf_read ON public.plan_features
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.subscriptions s
      JOIN public.workspace_members wm
        ON wm.workspace_id = s.workspace_id
       AND wm.user_id = auth.uid()
       AND wm.active = true
      WHERE s.plan_id = plan_features.plan_id
    )
  );

-- 3) workspace_members: drop client-side insert; only service role may insert
DROP POLICY IF EXISTS wm_insert ON public.workspace_members;
