import { createFileRoute } from "@tanstack/react-router";

/**
 * Public hook that drives the async audit export queue.
 * Two callers: the enqueue server function (best-effort immediate trigger)
 * and pg_cron (every minute — catches jobs that lost their initial trigger).
 */
export const Route = createFileRoute("/api/public/hooks/process-export-jobs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const bodyText = await request.text();
          let jobId: string | undefined;
          if (bodyText) {
            try {
              const parsed = JSON.parse(bodyText) as { jobId?: string };
              if (typeof parsed.jobId === "string") jobId = parsed.jobId;
            } catch {
              // Ignore malformed body — treated as a generic "drain queue" call.
            }
          }
          const { processExportJobs } = await import("@/lib/audit-export-processor.server");
          const result = await processExportJobs(jobId);
          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
