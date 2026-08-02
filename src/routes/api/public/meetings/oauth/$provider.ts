import { createFileRoute } from "@tanstack/react-router";

/**
 * Per-user OAuth callback for meeting platforms (Microsoft / Zoom / Google).
 * Trusts the HMAC-signed `state`, so no app session is required on this hop.
 */
export const Route = createFileRoute("/api/public/meetings/oauth/$provider")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const oauthError =
          url.searchParams.get("error_description") || url.searchParams.get("error");

        const done = (p: Record<string, string>) =>
          new Response(null, {
            status: 302,
            headers: { location: `/app/reunioes?${new URLSearchParams(p)}` },
          });

        const provider = params.provider;
        if (provider !== "microsoft" && provider !== "zoom" && provider !== "google") {
          return done({ conn: "error", message: "Plataforma inválida" });
        }
        if (oauthError) return done({ conn: "error", message: oauthError });
        if (!code || !state) return done({ conn: "error", message: "Retorno inválido do provedor" });

        try {
          const { verifyState } = await import("@/lib/crm/crypto.server");
          const payload = await verifyState<{
            workspaceId: string;
            userId: string;
            provider: string;
            origin: string;
            ts: number;
          }>(state);
          if (!payload || payload.provider !== provider) {
            return done({ conn: "error", message: "Assinatura de state inválida" });
          }
          if (Date.now() - payload.ts > 15 * 60 * 1000) {
            return done({ conn: "error", message: "Fluxo expirado, tente novamente" });
          }

          const { exchangeCode, saveConnection } = await import("@/lib/meetings/providers.server");
          const tokens = await exchangeCode(provider, code, payload.origin || url.origin);
          await saveConnection(payload.workspaceId, payload.userId, provider, tokens);
          return done({ conn: "connected", provider });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return done({ conn: "error", message: msg.slice(0, 200) });
        }
      },
    },
  },
});
