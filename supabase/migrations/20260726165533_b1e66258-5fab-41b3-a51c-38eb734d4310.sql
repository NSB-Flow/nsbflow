
-- is_super_admin: only allow querying self (or when no session, e.g. service_role)
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT (auth.uid() IS NULL OR auth.uid() = _user_id)
     AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin')
$$;

-- is_workspace_member
CREATE OR REPLACE FUNCTION public.is_workspace_member(_user_id uuid, _workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT (auth.uid() IS NULL OR auth.uid() = _user_id)
     AND EXISTS (
       SELECT 1 FROM public.workspace_members
       WHERE user_id = _user_id AND workspace_id = _workspace_id AND active = true
     )
$$;

-- is_workspace_admin
CREATE OR REPLACE FUNCTION public.is_workspace_admin(_user_id uuid, _workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT (auth.uid() IS NULL OR auth.uid() = _user_id)
     AND EXISTS (
       SELECT 1 FROM public.workspace_members
       WHERE user_id = _user_id AND workspace_id = _workspace_id AND active = true
         AND role IN ('super_admin','admin','admin_empresa','ceo','diretor')
     )
$$;

-- is_coordinator_or_above
CREATE OR REPLACE FUNCTION public.is_coordinator_or_above(_user_id uuid, _workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT (auth.uid() IS NULL OR auth.uid() = _user_id)
     AND (
       EXISTS (
         SELECT 1 FROM public.workspace_members
         WHERE user_id = _user_id AND workspace_id = _workspace_id AND active = true
           AND role IN ('super_admin','admin','admin_empresa','ceo','diretor','gerente','coordenador')
       )
       OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin')
     )
$$;

-- get_subordinates: only self, workspace admin of that workspace, or super admin
CREATE OR REPLACE FUNCTION public.get_subordinates(p_manager_id uuid, p_workspace_id uuid)
RETURNS SETOF uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND p_manager_id <> auth.uid()
     AND NOT EXISTS (
       SELECT 1 FROM public.workspace_members
       WHERE user_id = auth.uid() AND workspace_id = p_workspace_id AND active = true
         AND role IN ('super_admin','admin','admin_empresa','ceo','diretor')
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'
     )
  THEN
    RETURN;
  END IF;

  RETURN QUERY
    WITH RECURSIVE hierarchy AS (
      SELECT user_id FROM public.user_reports_to
       WHERE manager_id = p_manager_id AND workspace_id = p_workspace_id
      UNION
      SELECT urt.user_id FROM public.user_reports_to urt
      INNER JOIN hierarchy h ON urt.manager_id = h.user_id
       WHERE urt.workspace_id = p_workspace_id
    )
    SELECT user_id FROM hierarchy;
END;
$$;

-- can_view_user_scope: viewer must be the current user (or no session)
CREATE OR REPLACE FUNCTION public.can_view_user_scope(_viewer uuid, _target uuid, _workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT (auth.uid() IS NULL OR auth.uid() = _viewer)
     AND (
       _viewer = _target
       OR public.is_super_admin(_viewer)
       OR public.is_workspace_admin(_viewer, _workspace_id)
       OR EXISTS (
         SELECT 1 FROM public.get_subordinates(_viewer, _workspace_id) s WHERE s = _target
       )
     )
$$;
