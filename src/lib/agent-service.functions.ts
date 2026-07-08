import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RunInput = z.object({
  agent: z.string().min(1),
  runId: z.string().uuid().optional(),
  payload: z.record(z.any()),
});

/**
 * Executa um agente externo (n8n) e persiste em agent_runs.
 * A URL do webhook fica em app_settings (chave: n8n_webhook_url), editável por admin.
 */
export const runAgentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => RunInput.parse(raw))
  // Uniform return shape for serialization
  // { runId, status, result?, error? }
  .handler(async ({ data, context }): Promise<{ runId: string; status: "done" | "error"; result?: Record<string, unknown> | null; error?: string | null }> => {
    const { supabase, userId } = context;

    // Descobre webhook
    const { data: setting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "n8n_webhook_url")
      .maybeSingle();

    const webhookUrl =
      (setting?.value as { url?: string } | null)?.url ?? process.env.N8N_WEBHOOK_URL ?? "";

    // Cria ou reutiliza registro
    let runId = data.runId;
    const company = (data.payload.company as string) ?? null;
    const cnpj = (data.payload.cnpj as string) ?? null;

    if (!runId) {
      const { data: inserted, error: insErr } = await supabase
        .from("agent_runs")
        .insert({
          agent: data.agent,
          payload: data.payload,
          status: "pending",
          created_by: userId,
          company_name: company,
          cnpj,
          title: company ? `${data.agent} — ${company}` : data.agent,
        })
        .select("id")
        .single();
      if (insErr) throw new Error(insErr.message);
      runId = inserted.id;
    }

    if (!webhookUrl) {
      await supabase
        .from("agent_runs")
        .update({ status: "error", error: "Webhook do n8n não configurado" })
        .eq("id", runId);
      return {
        runId,
        status: "error" as const,
        error:
          "Nenhum webhook configurado. Um administrador deve cadastrar a URL em Configurações.",
      };
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
          payload: data.payload,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const text = await res.text();
      let json: unknown;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = { raw: text };
      }

      if (!res.ok) {
        await supabase
          .from("agent_runs")
          .update({ status: "error", error: `HTTP ${res.status}`, result: json as never })
          .eq("id", runId);
        return { runId, status: "error" as const, error: `HTTP ${res.status}`, result: json };
      }

      await supabase
        .from("agent_runs")
        .update({ status: "done", result: json as never, error: null })
        .eq("id", runId);

      return { runId, status: "done" as const, result: json };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      await supabase.from("agent_runs").update({ status: "error", error: msg }).eq("id", runId);
      return { runId, status: "error" as const, error: msg };
    }
  });

/** Salva URL de webhook (admin) */
export const saveWebhookUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ url: z.string().url().or(z.literal("")) }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
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
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) return { url: "", isAdmin: false as const };
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "n8n_webhook_url")
      .maybeSingle();
    return {
      isAdmin: true as const,
      url: (data?.value as { url?: string } | null)?.url ?? "",
    };
  });
