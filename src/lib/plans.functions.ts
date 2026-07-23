import { createServerFn } from "@tanstack/react-start";

export const listPublicPlansWithFeaturesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("plans")
    .select(
      "id, tier, name, description, price_monthly_cents, price_yearly_cents, max_users, sort_order, plan_features(feature_key, enabled)",
    )
    .eq("active", true)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
});
