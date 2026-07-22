import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import { useAuth } from "@/lib/auth-context";
import { useEntitlements } from "@/lib/entitlements";
import { applyWorkspaceAllotmentFn } from "@/lib/credits.functions";

export interface CreditsInfo {
  loading: boolean;
  unlimited: boolean;
  workspaceBalance: number;
  userBalance: number;
  userEligible: boolean;
  monthlyAllotment: number | null;
  seats: number;
  isPersonal: boolean;
  totalAvailable: number | null; // null = unlimited
}

export function useWorkspaceCredits(): CreditsInfo {
  const { workspaceId, workspace } = useWorkspace();
  const { user } = useAuth();
  const ent = useEntitlements();
  const applyAllotment = useServerFn(applyWorkspaceAllotmentFn);

  const enabled = !!workspaceId && !!user && !ent.loading && ent.planTier !== null;
  const unlimited = ent.planTier === "enterprise";

  const { data: wc, isLoading: wcLoading } = useQuery({
    queryKey: ["workspace-credits", workspaceId, ent.planTier],
    enabled: enabled && !unlimited,
    queryFn: async () => {
      // Lazy reset/rollover
      try { await applyAllotment({ data: { workspaceId: workspaceId! } }); } catch { /* noop */ }
      const { data } = await supabase
        .from("workspace_credits").select("balance, period_start")
        .eq("workspace_id", workspaceId!).maybeSingle();
      return data;
    },
    staleTime: 30_000,
  });

  const { data: uc } = useQuery({
    queryKey: ["user-credits-balance", user?.id],
    enabled: !!user && !unlimited,
    queryFn: async () => {
      const { data } = await supabase.from("user_credits")
        .select("balance").eq("user_id", user!.id).maybeSingle();
      return data;
    },
    staleTime: 30_000,
  });

  const userEligible = ent.status === "active";
  const workspaceBalance = wc?.balance ?? 0;
  const userBalance = uc?.balance ?? 0;
  const seats = ent.seatsTotal ?? 1;
  const isPersonal = workspace?.is_personal ?? true;
  const monthlyAllotment =
    ent.planTier === "smart" ? 100
    : ent.planTier === "pro" ? 250
    : null;

  return {
    loading: ent.loading || wcLoading,
    unlimited,
    workspaceBalance,
    userBalance,
    userEligible,
    monthlyAllotment,
    seats,
    isPersonal,
    totalAvailable: unlimited ? null : workspaceBalance + (userEligible ? userBalance : 0),
  };
}
