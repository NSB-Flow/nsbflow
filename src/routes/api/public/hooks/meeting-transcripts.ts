import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled transcript polling for remote meetings (Teams / Zoom / Meet).
 * Called by pg_cron every 15 minutes. Requires the CRON_SECRET shared secret.
 */
export const Route = createFileRoute("/api/public/hooks/meeting-transcripts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { assertCronCaller } = await import("@/lib/cron-auth.server");
        const denied = assertCronCaller(request);
        if (denied) return denied;
        try {
          const { pollTranscripts } = await import("@/lib/meetings/transcripts.server");
          const result = await pollTranscripts();
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
