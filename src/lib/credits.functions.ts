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

/**
 * Solicita alteração de assentos contratados (PJ). NUNCA aplica direto:
 * cria uma solicitação pendente que só um super admin (ou o webhook do
 * gateway de pagamento) pode aprovar — caso contrário um admin de workspace
 * poderia inflar assentos e, com isso, o pool mensal de créditos de graça.
 */
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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: ws } = await supabaseAdmin
      .from("workspaces").select("id, is_personal").eq("id", data.workspaceId).maybeSingle();
    if (!ws) throw new Error("Workspace não encontrado.");
    if (ws.is_personal) throw new Error("Assentos aplicam-se apenas a workspaces de empresa.");

    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("id, plan_id, billing_cycle, seats")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (!sub) throw new Error("Assinatura não encontrada.");
    if (sub.seats === data.seats) return { ok: true as const, status: "unchanged" as const };

    // Já existe solicitação pendente?
    const { data: pending } = await supabaseAdmin
      .from("subscription_requests")
      .select("id")
      .eq("workspace_id", data.workspaceId)
      .eq("status", "pending")
      .maybeSingle();
    if (pending) throw new Error("Já existe uma solicitação pendente para este workspace.");

    const { data: plan } = await supabaseAdmin
      .from("plans")
      .select("id, price_monthly_cents, price_yearly_cents")
      .eq("id", sub.plan_id)
      .maybeSingle();
    if (!plan) throw new Error("Plano não encontrado.");

    // Preço calculado no servidor — o cliente nunca define valores.
    const base = sub.billing_cycle === "yearly" ? plan.price_yearly_cents : plan.price_monthly_cents;
    const amountCents = Math.max(0, base * data.seats);

    const { data: req, error } = await supabaseAdmin
      .from("subscription_requests")
      .insert({
        workspace_id: data.workspaceId,
        plan_id: plan.id,
        billing_cycle: sub.billing_cycle,
        seats: data.seats,
        amount_cents: amountCents,
        status: "pending",
        requested_by: userId,
      })
      .select("id, seats, amount_cents")
      .single();
    if (error) throw new Error("Não foi possível registrar a solicitação de assentos.");

    return {
      ok: true as const,
      status: "pending" as const,
      requestId: req.id as string,
      seats: req.seats as number,
      amountCents: req.amount_cents as number,
    };
  });


// NOTA: o bônus de conversão de indicação NÃO é exposto ao cliente.
// Ele é concedido exclusivamente no servidor, em reviewSubscriptionRequestFn
// (aprovação/confirmação de pagamento), via RPC apply_referral_paid.

