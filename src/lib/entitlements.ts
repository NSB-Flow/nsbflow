/**
 * Feature-flag catalog + entitlements hook.
 * Cada plano libera um conjunto de features. Enterprise pode ter overrides customizados.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";

export type FeatureKey =
  | "deap.meeting.briefing"
  | "deap.meeting.intelligence"
  | "deap.assessment.sales"
  | "deap.assessment.leadership"
  | "deap.assessment.process"
  | "deap.assessment.executive"
  | "dashboard.executive"
  | "reports"
  | "history"
  | "pdf.export"
  | "biblioteca"
  | "academy"
  | "empresas"
  | "pessoas";

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  "deap.meeting.briefing": "DEAP Briefing AI",
  "deap.meeting.intelligence": "DEAP Meeting Intelligence AI",
  "deap.assessment.sales": "Sales Development AI",
  "deap.assessment.leadership": "Leadership AI",
  "deap.assessment.process": "Process & Execution AI",
  "deap.assessment.executive": "Executive Intelligence AI",
  "dashboard.executive": "Dashboard Executivo",
  reports: "Relatórios",
  history: "Histórico",
  "pdf.export": "Exportação em PDF",
  biblioteca: "Biblioteca",
  academy: "Academy",
  empresas: "Empresas (CRM)",
  pessoas: "Pessoas",
};

export interface Entitlements {
  loading: boolean;
  planTier: "smart" | "pro" | "enterprise" | null;
  planName: string;
  status: "trialing" | "active" | "past_due" | "canceled" | "expired" | null;
  isTrialing: boolean;
  isTrialExpired: boolean;
  trialDaysLeft: number;
  trialEndsAt: string | null;
  seatsTotal: number | null;
  seatsUsed: number;
  seatsAvailable: number | null;
  features: Set<FeatureKey>;
  has: (f: FeatureKey) => boolean;
  subscriptionId: string | null;
  planId: string | null;
  billingCycle: "monthly" | "yearly";
  currentPeriodEnd: string | null;
}

const EMPTY: Entitlements = {
  loading: true,
  planTier: null,
  planName: "—",
  status: null,
  isTrialing: false,
  isTrialExpired: false,
  trialDaysLeft: 0,
  trialEndsAt: null,
  seatsTotal: null,
  seatsUsed: 0,
  seatsAvailable: null,
  features: new Set(),
  has: () => false,
  subscriptionId: null,
  planId: null,
  billingCycle: "monthly",
  currentPeriodEnd: null,
};

export function useEntitlements(): Entitlements {
  const { workspaceId } = useWorkspace();

  const { data, isLoading } = useQuery({
    queryKey: ["entitlements", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      if (!workspaceId) return null;

      const { data: sub } = await supabase
        .from("subscriptions")
        .select("id, status, billing_cycle, seats, trial_ends_at, current_period_end, plan_id, plans(id, tier, name)")
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (!sub) return null;

      const [{ data: pf }, { data: grants }, { count: seatsUsed }] = await Promise.all([
        supabase.from("plan_features").select("feature_key, enabled").eq("plan_id", sub.plan_id),
        supabase.from("enterprise_module_grants").select("feature_key, enabled").eq("subscription_id", sub.id),
        supabase.from("workspace_members").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("active", true),
      ]);

      const features = new Set<FeatureKey>();
      for (const f of pf ?? []) if (f.enabled) features.add(f.feature_key as FeatureKey);
      for (const g of grants ?? []) {
        if (g.enabled) features.add(g.feature_key as FeatureKey);
        else features.delete(g.feature_key as FeatureKey);
      }

      const plan = Array.isArray(sub.plans) ? sub.plans[0] : sub.plans;

      return {
        sub,
        plan,
        features,
        seatsUsed: seatsUsed ?? 0,
      };
    },
    staleTime: 60_000,
  });

  if (isLoading || !data) return { ...EMPTY, loading: isLoading };

  const { sub, plan, features, seatsUsed } = data;
  const trialEndsAt = sub.trial_ends_at as string | null;
  const trialMs = trialEndsAt ? new Date(trialEndsAt).getTime() - Date.now() : 0;
  const trialDaysLeft = trialMs > 0 ? Math.ceil(trialMs / 86400000) : 0;
  const isTrialing = sub.status === "trialing" && trialMs > 0;
  const isTrialExpired = sub.status === "trialing" && trialMs <= 0;

  return {
    loading: false,
    planTier: (plan?.tier as Entitlements["planTier"]) ?? null,
    planName: plan?.name ?? "—",
    status: sub.status as Entitlements["status"],
    isTrialing,
    isTrialExpired,
    trialDaysLeft,
    trialEndsAt,
    seatsTotal: sub.seats ?? null,
    seatsUsed,
    seatsAvailable: sub.seats != null ? Math.max(0, sub.seats - seatsUsed) : null,
    features,
    has: (f) => features.has(f),
    subscriptionId: sub.id,
    planId: sub.plan_id,
    billingCycle: sub.billing_cycle as "monthly" | "yearly",
    currentPeriodEnd: sub.current_period_end as string | null,
  };
}
