import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/hooks/agent-result")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const secret = request.headers.get("x-webhook-secret");
          const expectedSecret = process.env.N8N_CALLBACK_SECRET;

          // 0) Log infra info (no keys)
          const supabaseUrl = process.env.SUPABASE_URL || "NOT_SET";
          console.log(`[agent-result] [DEBUG] Supabase Project URL: ${supabaseUrl}`);

          if (!expectedSecret || secret !== expectedSecret) {
            console.error("[agent-result] Unauthorized callback attempt");
            return new Response("Unauthorized", { status: 401 });
          }

          const body = await request.json();
          const { agent_run_id, status, result, structured_data, error } = body;

          console.log(`[agent-result] [DEBUG] Received agent_run_id: ${agent_run_id}, status: ${status}`);

          // 1) Busca o run original
          const { data: run, error: runErr } = await supabaseAdmin
            .from("agent_runs")
            .select("agent, workspace_id, company_id, created_by, status")
            .eq("id", agent_run_id)
            .maybeSingle();

          if (runErr || !run) {
            console.error(`[agent-result] [DEBUG] Run ${agent_run_id} not found. Error: ${runErr?.message || 'none'}`);
            return new Response("Run not found", { status: 404 });
          }

          console.log(`[agent-result] [DEBUG] Found run status: ${run.status}`);

          // 2) Atualiza agent_runs
          const newStatus = status === "completed" ? "done" : "error";
          console.log(`[agent-result] [DEBUG] Attempting update on table 'agent_runs' for id: ${agent_run_id}`);
          
          const { data: updatedRows, error: updateErr, count } = await supabaseAdmin
            .from("agent_runs")
            .update({
              status: newStatus,
              result: result || null,
              structured_data: structured_data || null,
              error: error || null,
              updated_at: new Date().toISOString(),
            }, { count: 'exact' })
            .eq("id", agent_run_id)
            .select();

          console.log(`[agent-result] [DEBUG] Update result for ${agent_run_id}: count=${count}, error=${updateErr?.message || 'none'}`);
          if (updatedRows && updatedRows.length > 0) {
            console.log(`[agent-result] [DEBUG] Updated record:`, JSON.stringify(updatedRows[0]));
          }

          if (updateErr) {
            console.error(`[agent-result] [DEBUG] Update database error: ${updateErr.message}`);
            return new Response(JSON.stringify({ ok: false, error: updateErr.message }), { 
              status: 500,
              headers: { "Content-Type": "application/json" }
            });
          }

          if (count === 0) {
            console.error(`[agent-result] [DEBUG] No rows updated for run ${agent_run_id}`);
            return new Response(JSON.stringify({ ok: false, error: "Run ID not found during update" }), { 
              status: 404,
              headers: { "Content-Type": "application/json" }
            });
          }

          // 3) Se for deap_intelligence, popula meeting_analyses
          if (run.agent === "deap_intelligence" && status === "completed" && structured_data) {
            const sd = structured_data;
            const analysis = {
              agent_run_id: agent_run_id,
              company_id: run.company_id!,
              workspace_id: run.workspace_id!,
              meeting_score: typeof sd.meeting_score === "number" ? sd.meeting_score : null,
              opportunity_score: typeof sd.opportunity_score === "number" ? sd.opportunity_score : null,
              nps_estimate: typeof sd.nps_estimate === "number" ? sd.nps_estimate : null,
              briefing_used: !!sd.briefing_used,
              analysis_completeness: typeof sd.analysis_completeness === "number" ? sd.analysis_completeness : null,
              coaching_scores: sd.coaching_scores || null,
              metadata: sd,
            };

            const { error: analysisErr } = await supabaseAdmin
              .from("meeting_analyses")
              .upsert(analysis, { onConflict: "agent_run_id" });

            if (analysisErr) {
              console.error(`[agent-result] [DEBUG] Analysis upsert error: ${analysisErr.message}`);
            }
          }

          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          console.error(`[agent-result] [DEBUG] Fatal error: ${e instanceof Error ? e.message : "Unknown"}`);
          return new Response("Bad request", { status: 400 });
        }
      },
    },
  },
});
