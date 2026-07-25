-- Restrict agents SELECT to super admins to hide n8n_webhook_url and other sensitive columns
DROP POLICY IF EXISTS agents_read_authenticated ON public.agents;
CREATE POLICY agents_read_super_admin ON public.agents
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- Restrict coupons SELECT to super admins; app-facing validation must go through a server function
DROP POLICY IF EXISTS coup_read ON public.coupons;
CREATE POLICY coup_read_super_admin ON public.coupons
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));