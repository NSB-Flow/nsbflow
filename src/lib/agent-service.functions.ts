import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

const RunInput = z.object({
  agent: z.string().min(1),
  workspaceId: z.string().uuid(),
  companyId: z.string().uuid(),
  runId: z.string().uuid().optional(),
  payload: z.record(z.any()),
});

/**
 * Executa um agente externo (n8n) e persiste em agent_runs.
 * A URL do webhook fica em app_settings (chave: n8n_webhook_url), editável por admin.
 * Consome 1 crédito (pool do workspace → saldo pessoal de indicação) antes de disparar.
 * O company_id é obrigatório — snapshot de razao_social/cnpj é gravado em agent_runs.
 */
export const runAgentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => RunInput.parse(raw))
  .handler(async ({ data, context }): Promise<{ runId: string; status: "done" | "error"; result?: Json | null; error?: string | null; creditSource?: string }> => {
    const { supabase, userId } = context;

    // 1) valida membership no workspace
    const { data: member } = await supabase
      .from("workspace_members")
      .select("id").eq("workspace_id", data.workspaceId).eq("user_id", userId).eq("active", true)
      .maybeSingle();
    if (!member) throw new Error("Sem acesso a este workspace.");

    // 2) resolve conta (isolamento por workspace via RLS)
    const { data: company, error: companyErr } = await supabase
      .from("companies")
      .select("id, razao_social, cnpj, workspace_id")
      .eq("id", data.companyId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (companyErr) throw new Error(companyErr.message);
    if (!company) throw new Error("Conta não encontrada neste workspace.");

    // 3) setor do vendedor a partir do perfil
    const { data: profile } = await supabase
      .from("profiles").select("sector").eq("id", userId).maybeSingle();
    const sellerSector = profile?.sector ?? null;

    // 4) consome crédito (workspace pool → user pool). Enterprise = ilimitado.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 4a) resolve agente central por slug e valida min_plan
    const { data: agentRow } = await supabase
      .from("agents")
      .select("id, slug, display_name, min_plan, is_active")
      .eq("slug", data.agent)
      .maybeSingle();

    if (agentRow && !agentRow.is_active) {
      throw new Error("Agente indisponível no momento.");
    }

    // Exceção deliberada: super_admins são isentos do gate de min_plan e do
    // consumo de créditos para permitir testes/administração interna da plataforma,
    // mesmo em workspaces sem assinatura ativa. Não é regra de negócio para clientes finais.
    const { data: isSuper } = await supabase.rpc("is_super_admin", { _user_id: userId });

    if (agentRow?.min_plan && !isSuper) {
      const { data: subRow } = await supabase
        .from("subscriptions")
        .select("plans(tier)")
        .eq("workspace_id", data.workspaceId)
        .maybeSingle();
      const plan = Array.isArray(subRow?.plans) ? subRow?.plans[0] : subRow?.plans;
      const tierRank: Record<string, number> = { smart: 1, pro: 2, enterprise: 3 };
      const currentRank = tierRank[plan?.tier ?? ""] ?? 0;
      const requiredRank = tierRank[agentRow.min_plan] ?? 0;
      if (currentRank < requiredRank) {
        const label = agentRow.min_plan.charAt(0).toUpperCase() + agentRow.min_plan.slice(1);
        throw new Error(`Este agente requer o plano ${label} ou superior.`);
      }
    }

    // Cria ou reutiliza registro
    let runId = data.runId;
    if (!runId) {
      const { data: inserted, error: insErr } = await supabase
        .from("agent_runs")
        .insert({
          agent: data.agent,
          agent_id: agentRow?.id ?? null,
          workspace_id: data.workspaceId,
          company_id: company.id,
          payload: data.payload,
          status: "pending",
          created_by: userId,
          company_name: company.razao_social,
          cnpj: company.cnpj,
          title: `${agentRow?.display_name ?? data.agent} — ${company.razao_social}`,
        })
        .select("id")
        .single();
      if (insErr) throw new Error(insErr.message);
      runId = inserted.id;
    }

    let creditSource: string | undefined;
    if (isSuper) {
      // Super_admin: bypass do consumo de crédito (ver comentário acima).
      creditSource = "super_admin_bypass";
    } else {
      const { data: creditRes, error: creditErr } = await supabaseAdmin.rpc("try_consume_agent_credit", {
        _workspace_id: data.workspaceId,
        _user_id: userId,
        _run_id: runId,
        _description: `Execução: ${data.agent}`,
      });
      if (creditErr) throw new Error(creditErr.message);
      const credit = creditRes as { ok: boolean; source?: string; reason?: string };
      if (!credit?.ok) {
        const reason = credit?.reason ?? "no_credit";
        const msg =
          reason === "workspace_empty_and_user_ineligible" || reason === "all_pools_empty"
            ? "Créditos esgotados. Contrate mais assentos, faça upgrade do plano ou aguarde a próxima reposição mensal."
            : reason === "no_subscription"
            ? "Nenhuma assinatura ativa neste workspace."
            : "Não foi possível autorizar o consumo de créditos.";
        await supabase.from("agent_runs").update({ status: "error", error: msg }).eq("id", runId);
        return { runId, status: "error", error: msg };
      }
      creditSource = credit.source;
    }

    // 5) webhook
    const { data: setting } = await supabase
      .from("app_settings").select("value").eq("key", "n8n_webhook_url").maybeSingle();
    const webhookUrl =
      (setting?.value as { url?: string } | null)?.url ?? process.env.N8N_WEBHOOK_URL ?? "";

    if (!webhookUrl) {
      const msg = "Nenhum webhook configurado. Um administrador deve cadastrar a URL em Configurações.";
      await supabase.from("agent_runs").update({ status: "error", error: msg }).eq("id", runId);
      return { runId, status: "error", error: msg };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: data.agent,
          runId,
          workspaceId: data.workspaceId,
          companyId: company.id,
          company: { id: company.id, razao_social: company.razao_social, cnpj: company.cnpj },
          seller: { userId, sector: sellerSector },
          payload: data.payload,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const text = await res.text();
      let json: Json;
      try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }

      if (!res.ok) {
        await supabase.from("agent_runs")
          .update({ status: "error", error: `HTTP ${res.status}`, result: json as never })
          .eq("id", runId);
        return { runId, status: "error", error: `HTTP ${res.status}`, result: json };
      }

      await supabase.from("agent_runs")
        .update({ status: "done", result: json as never, error: null })
        .eq("id", runId);

      return { runId, status: "done", result: json, creditSource: credit.source };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      await supabase.from("agent_runs").update({ status: "error", error: msg }).eq("id", runId);
      return { runId, status: "error", error: msg };
    }
  });

/** Salva URL de webhook (admin) */
export const saveWebhookUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ url: z.string().url().or(z.literal("")) }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Apenas administradores podem editar as configurações.");
    const { error } = await supabase.from("app_settings").upsert({
      key: "n8n_webhook_url",
      value: { url: data.url },
      updated_by: userId,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Retorna URL configurada (admin) */
export const getWebhookUrlFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) return { url: "", isAdmin: false as const };
    const { data } = await supabase.from("app_settings").select("value").eq("key", "n8n_webhook_url").maybeSingle();
    return { isAdmin: true as const, url: (data?.value as { url?: string } | null)?.url ?? "" };
  });
