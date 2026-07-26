import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, jsonOk, parsePagination } from "@/lib/api-export.server";

export const Route = createFileRoute("/api/public/v1/opportunities")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiKey(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const { limit, offset, from, to } = parsePagination(url);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let q = supabaseAdmin
          .from("opportunities")
          .select("*", { count: "exact" })
          .eq("workspace_id", auth.workspaceId)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (from) q = q.gte("created_at", from);
        if (to) q = q.lte("created_at", to);
        const { data, count, error } = await q;
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "content-type": "application/json" } });
        return jsonOk(data ?? [], { limit, offset, total: count ?? 0 });
      },
    },
  },
});
