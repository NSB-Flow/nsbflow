import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Aplica a reposição mensal do pool do workspace (lazy). Membros do workspace podem chamar. */
export const applyWorkspaceAllotmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Precisa ser membro do workspace (RLS gate manual — chamada via admin)
    const { data: member } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle();
    if (!member) throw new Error("Sem acesso a este workspace.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("apply_workspace_allotment", {
      _workspace_id: data.workspaceId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Ajuste manual do pool do workspace (somente super_admin). */
export const adminAdjustWorkspaceCreditsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      workspaceId: z.string().uuid(),
      amount: z.number().int(),
      description: z.string().max(500).optional(),
    }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isSuper } = await supabase.rpc("is_super_admin", { _user_id: userId });
    if (!isSuper) throw new Error("Apenas super administradores.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Ensure row exists
    await supabaseAdmin.from("workspace_credits").upsert({
      workspace_id: data.workspaceId,
      balance: 0,
    }, { onConflict: "workspace_id", ignoreDuplicates: true });

    const { data: current } = await supabaseAdmin
      .from("workspace_credits").select("balance").eq("workspace_id", data.workspaceId).single();
    const newBalance = Math.max(0, (current?.balance ?? 0) + data.amount);
    const { error: upErr } = await supabaseAdmin
      .from("workspace_credits").update({ balance: newBalance }).eq("workspace_id", data.workspaceId);
    if (upErr) throw new Error(upErr.message);

    await supabaseAdmin.from("workspace_credit_transactions").insert({
      workspace_id: data.workspaceId,
      amount: data.amount,
      kind: "manual_adjust",
      description: data.description ?? "Ajuste manual do super admin",
      created_by: userId,
    });
    return { ok: true, balance: newBalance };
  });

/** Atualiza assentos contratados (PJ). Recalcula pool só na próxima reposição. */
export const updateSubscriptionSeatsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ workspaceId: z.string().uuid(), seats: z.number().int().min(1).max(10000) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("is_workspace_admin", {
      _user_id: userId, _workspace_id: data.workspaceId,
    });
    if (!isAdmin) throw new Error("Apenas administradores do workspace.");

    const { error } = await supabase
      .from("subscriptions")
      .update({ seats: data.seats })
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Concede o bônus de conversão de indicação (chamado ao ativar assinatura paga do indicado). */
export const applyReferralPaidFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("apply_referral_paid", {
      _referred_user_id: userId,
    });
    if (error) throw new Error(error.message);
    return data as { ok: boolean; reason?: string; bonus?: number };
  });
