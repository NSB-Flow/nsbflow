import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Cria um novo workspace (PJ) com o usuário como admin_empresa e assinatura em trial. */
export const createWorkspaceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ name: z.string().trim().min(1).max(120) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const slug =
      data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) +
      "-" +
      Math.random().toString(36).slice(2, 6);

    const { data: ws, error: wsErr } = await supabaseAdmin
      .from("workspaces")
      .insert({ name: data.name, slug, owner_user_id: userId, is_personal: false })
      .select()
      .single();
    if (wsErr || !ws) throw new Error(wsErr?.message ?? "Falha ao criar workspace");

    const { error: memErr } = await supabaseAdmin.from("workspace_members").insert({
      workspace_id: ws.id,
      user_id: userId,
      role: "admin_empresa",
    });
    if (memErr) throw new Error(memErr.message);

    const { data: smart } = await supabaseAdmin
      .from("plans")
      .select("id")
      .eq("tier", "smart")
      .maybeSingle();
    if (smart) {
      await supabaseAdmin.from("subscriptions").insert({
        workspace_id: ws.id,
        plan_id: smart.id,
        status: "trialing",
        trial_ends_at: new Date(Date.now() + 3 * 86400000).toISOString(),
        current_period_end: new Date(Date.now() + 3 * 86400000).toISOString(),
        seats: 1,
      });
    }

    return { id: ws.id, name: ws.name };
  });
