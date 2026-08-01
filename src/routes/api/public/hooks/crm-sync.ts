import { createFileRoute } from "@tanstack/react-router";

/**
 * Inbound CRM polling (Salesforce -> NSB Flow).
 * Called by pg_cron every 15 minutes.
 */
export const Route = createFileRoute("/api/public/hooks/crm-sync")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { runInboundSyncAll } = await import("@/lib/crm/sync.server");
          const result = await runInboundSyncAll();
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
