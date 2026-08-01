import { createFileRoute } from "@tanstack/react-router";

/**
 * Salesforce OAuth2 callback. Trusts the HMAC-signed `state` produced by
 * startCrmOAuthFn, so no app session is required on this hop.
 */
export const Route = createFileRoute("/api/public/crm/salesforce/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");

        const done = (params: Record<string, string>) =>
          new Response(null, {
            status: 302,
            headers: {
              location: `/app/admin-modules?${new URLSearchParams({ tab: "crm", ...params }).toString()}`,
            },
          });

        if (oauthError) return done({ crm: "error", message: oauthError });
        if (!code || !state) return done({ crm: "error", message: "Retorno inválido do Salesforce" });

        try {
          const { verifyState } = await import("@/lib/crm/crypto.server");
          const payload = await verifyState<{ workspaceId: string; userId: string; origin: string; ts: number }>(
            state,
          );
          if (!payload) return done({ crm: "error", message: "Assinatura de state inválida" });
          if (Date.now() - payload.ts > 15 * 60 * 1000) {
            return done({ crm: "error", message: "Fluxo expirado, tente novamente" });
          }

          const { exchangeCode, saveConnectionTokens } = await import("@/lib/crm/salesforce.server");
          const tokens = await exchangeCode(code, payload.origin || url.origin);
          await saveConnectionTokens(payload.workspaceId, payload.userId, tokens);

          const { seedDefaultMappings } = await import("@/lib/crm/sync.server");
          await seedDefaultMappings(payload.workspaceId);

          return done({ crm: "connected" });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return done({ crm: "error", message: msg.slice(0, 200) });
        }
      },
    },
  },
});
