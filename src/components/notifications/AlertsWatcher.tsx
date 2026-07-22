import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { useEntitlements } from "@/lib/entitlements";
import { useWorkspaceCredits } from "@/lib/workspace-credits";
import { recordNotification, type NotificationSeverity } from "@/lib/notifications";
import { useAlertPrefs } from "@/lib/alert-prefs";

/**
 * Monitora saldo de créditos e trial. Dispara toast + registra notificação no banco.
 * Dedupe por dia (créditos) e por data de expiração (trial), evitando spam.
 * Limiares e opt-in são configuráveis em /app/configuracoes.
 */
export function AlertsWatcher() {
  const { user } = useAuth();
  const { workspaceId } = useWorkspace();
  const ent = useEntitlements();
  const credits = useWorkspaceCredits();
  const qc = useQueryClient();
  const { prefs, hydrated } = useAlertPrefs(user?.id);
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user || ent.loading || credits.loading || !hydrated || !prefs.enabled) return;

    const today = new Date().toISOString().slice(0, 10);

    const fire = async (opts: {
      kind: string;
      severity: NotificationSeverity;
      title: string;
      body: string;
      dedupeKey: string;
      actionUrl?: string;
    }) => {
      if (firedRef.current.has(opts.dedupeKey)) return;
      firedRef.current.add(opts.dedupeKey);
      const created = await recordNotification({
        userId: user.id,
        workspaceId,
        kind: opts.kind,
        severity: opts.severity,
        title: opts.title,
        body: opts.body,
        dedupeKey: opts.dedupeKey,
        actionUrl: opts.actionUrl ?? null,
      });
      if (created) {
        const t = opts.severity === "critical" ? toast.error : toast.warning;
        t(opts.title, { description: opts.body, duration: 8000 });
        qc.invalidateQueries({ queryKey: ["user-notifications"] });
      }
    };

    // ── Trial ─────────────────────────────────────
    if (ent.isTrialing && ent.trialEndsAt) {
      const endTag = ent.trialEndsAt.slice(0, 10);
      if (ent.trialDaysLeft <= 1) {
        fire({
          kind: "trial.expiring",
          severity: "critical",
          title: "Seu trial expira em menos de 24h",
          body: "Escolha um plano para não perder o acesso aos agentes NSB Flow.",
          dedupeKey: `trial:1d:${endTag}`,
          actionUrl: "/app/planos",
        });
      } else if (ent.trialDaysLeft <= prefs.trialWarnDays) {
        fire({
          kind: "trial.expiring",
          severity: "warning",
          title: `Trial termina em ${ent.trialDaysLeft} dias`,
          body: "Ative um plano para manter suas execuções sem interrupção.",
          dedupeKey: `trial:${prefs.trialWarnDays}d:${endTag}`,
          actionUrl: "/app/planos",
        });
      }
    }
    if (ent.isTrialExpired) {
      fire({
        kind: "trial.expired",
        severity: "critical",
        title: "Trial expirado",
        body: "Contrate um plano para retomar o acesso aos agentes.",
        dedupeKey: `trial:expired:${ent.trialEndsAt ?? "x"}`,
        actionUrl: "/app/planos",
      });
    }

    // ── Créditos ──────────────────────────────────
    if (!credits.unlimited && workspaceId) {
      const total = credits.totalAvailable ?? 0;
      const allotment = credits.monthlyAllotment ?? 100;
      const pct = allotment > 0 ? (total / allotment) * 100 : 0;
      const warnPct = prefs.warnPct;
      const criticalPct = prefs.criticalPct;

      if (total <= 0) {
        fire({
          kind: "credits.empty",
          severity: "critical",
          title: "Créditos esgotados",
          body: "Adicione assentos, faça upgrade ou aguarde a reposição mensal.",
          dedupeKey: `credits:empty:${workspaceId}:${today}`,
          actionUrl: "/app/assinatura",
        });
      } else if (pct <= criticalPct) {
        fire({
          kind: "credits.low",
          severity: "critical",
          title: `Apenas ${total} créditos restantes`,
          body: `Você está abaixo de ${criticalPct}% da cota. Considere fazer upgrade do plano.`,
          dedupeKey: `credits:critical:${workspaceId}:${criticalPct}:${today}`,
          actionUrl: "/app/assinatura",
        });
      } else if (pct <= warnPct) {
        fire({
          kind: "credits.low",
          severity: "warning",
          title: `Saldo baixo: ${total} créditos`,
          body: `Você atingiu ${warnPct}% da cota mensal do plano ${ent.planName}.`,
          dedupeKey: `credits:low:${workspaceId}:${warnPct}:${today}`,
          actionUrl: "/app/assinatura",
        });
      }
    }
  }, [
    user,
    workspaceId,
    ent.loading,
    ent.isTrialing,
    ent.isTrialExpired,
    ent.trialDaysLeft,
    ent.trialEndsAt,
    ent.planName,
    credits.loading,
    credits.unlimited,
    credits.totalAvailable,
    credits.monthlyAllotment,
    hydrated,
    prefs.enabled,
    prefs.warnPct,
    prefs.criticalPct,
    prefs.trialWarnDays,
    qc,
  ]);

  return null;
}
