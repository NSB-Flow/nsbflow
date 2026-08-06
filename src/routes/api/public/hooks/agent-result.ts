import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CallbackSchema = z.object({
  agent_run_id: z.string().uuid(),
  status: z.enum(["completed", "error"]),
  result: z.string().optional().nullable(),
  structured_data: z.record(z.any()).optional().nullable(),
  error: z.string().optional().nullable(),
});

export const Route = createFileRoute("/api/public/hooks/agent-result")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const secret = request.headers.get("x-webhook-secret");
          const expectedSecret = process.env.N8N_CALLBACK_SECRET;

          if (!expectedSecret || secret !== expectedSecret) {
            console.error("[agent-result] Unauthorized callback attempt");
            return new Response("Unauthorized", { status: 401 });
          }

          const body = await request.json();
          const data = CallbackSchema.parse(body);

          console.log(`[agent-result] Receiving result for run ${data.agent_run_id} (status: ${data.status})`);

          // 1) Busca o run original para saber o agent e o workspace/company
          const { data: run, error: runErr } = await supabaseAdmin
            .from("agent_runs")
            .select("agent, workspace_id, company_id, created_by")
            .eq("id", data.agent_run_id)
            .maybeSingle();

          if (runErr || !run) {
            console.error(`[agent-result] Run ${data.agent_run_id} not found`);
            return new Response("Run not found", { status: 404 });
          }

          // 2) Atualiza agent_runs
          console.log(`[agent-result] Updating run ${data.agent_run_id}`);
          const { error: updateErr, count } = await supabaseAdmin
            .from("agent_runs")
            .update({
              status: data.status === "completed" ? "done" : "error",
              result: data.result || null,
              structured_data: data.structured_data || null,
              error: data.error || null,
              updated_at: new Date().toISOString(),
            }, { count: 'exact' })
            .eq("id", data.agent_run_id);

          console.log(`[agent-result] Update result for ${data.agent_run_id}: count=${count}, error=${updateErr?.message || 'none'}`);

          if (updateErr) {
            console.error(`[agent-result] Update database error: ${updateErr.message}`);
            return new Response(JSON.stringify({ ok: false, error: updateErr.message }), { 
              status: 500,
              headers: { "Content-Type": "application/json" }
            });
          }

          if (count === 0) {
            console.error(`[agent-result] No rows updated for run ${data.agent_run_id}`);
            return new Response(JSON.stringify({ ok: false, error: "Run ID not found during update" }), { 
              status: 404,
              headers: { "Content-Type": "application/json" }
            });
          }

          // 3) Se for deap_intelligence, popula meeting_analyses
          if (run.agent === "deap_intelligence" && data.status === "completed" && data.structured_data) {
            const sd = data.structured_data;
            
            // Mapeamento de campos conforme especificação
            const analysis = {
              agent_run_id: data.agent_run_id,
              company_id: run.company_id!,
              workspace_id: run.workspace_id!,
              meeting_score: typeof sd.meeting_score === "number" ? sd.meeting_score : null,
              opportunity_score: typeof sd.opportunity_score === "number" ? sd.opportunity_score : null,
              nps_estimate: typeof sd.nps_estimate === "number" ? sd.nps_estimate : null,
              briefing_used: !!sd.briefing_used,
              analysis_completeness: typeof sd.analysis_completeness === "number" ? sd.analysis_completeness : null,
              coaching_scores: sd.coaching_scores || null,
              metadata: sd, // Salva o payload completo como metadados por segurança
            };

            const { error: analysisErr } = await supabaseAdmin
              .from("meeting_analyses")
              .upsert(analysis, { onConflict: "agent_run_id" });

            if (analysisErr) {
              console.error(`[agent-result] Analysis upsert error: ${analysisErr.message}`);
              // Não falha o request do webhook se a gravação de indicadores falhar, 
              // mas logamos o erro.
            }
          }

          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          console.error(`[agent-result] Fatal error: ${e instanceof Error ? e.message : "Unknown"}`);
          return new Response("Bad request", { status: 400 });
        }
      },
    },
  },
});
