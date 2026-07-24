
-- 1) user_notifications: restrict insert to own user AND membership in referenced workspace
DROP POLICY IF EXISTS notif_insert_own ON public.user_notifications;
CREATE POLICY notif_insert_own ON public.user_notifications
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    workspace_id IS NULL
    OR public.is_workspace_member(auth.uid(), workspace_id)
  )
);

-- 2) workspace_members: add WITH CHECK mirroring USING; prevent role escalation to super_admin
DROP POLICY IF EXISTS wm_update ON public.workspace_members;
CREATE POLICY wm_update ON public.workspace_members
FOR UPDATE TO authenticated
USING (public.is_workspace_admin(auth.uid(), workspace_id))
WITH CHECK (
  public.is_workspace_admin(auth.uid(), workspace_id)
  AND role <> 'super_admin'
);
