import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ADMIN_ROLES = ["super_admin", "admin", "admin_empresa", "ceo", "diretor"];

const requestSchema = z.object({
  workspaceId: z.string().uuid(),
  planId: z.string().uuid(),
  cycle: z.enum(["monthly", "yearly"]),
  seats: z.number().int().min(1).max(10000).default(1),
  couponCode: z.string().min(1).max(64).optional(),
});

/**
 * Registra uma SOLICITAÇÃO de assinatura. Nada é ativado aqui:
 * a ativação só acontece após confirmação de pagamento (aprovação por
 * super admin ou webhook do gateway). O preço, o cupom e os limites de
 * plano são recalculados no servidor — nunca confiamos no cliente.
 */
export const requestSubscriptionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => requestSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: isSuper } = await context.supabase.rpc("is_super_admin", {
      _user_id: context.userId,
    });

    const { data: member } = await context.supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .eq("active", true)
      .maybeSingle();

    if (!isSuper && !(member && ADMIN_ROLES.includes(member.role as string))) {
      throw new Error("Forbidden: apenas administradores do workspace");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: ws } = await admin
      .from("workspaces")
      .select("id, is_personal")
      .eq("id", data.workspaceId)
      .maybeSingle();
    if (!ws) throw new Error("Workspace não encontrado");

    const { data: plan } = await admin
      .from("plans")
      .select("id, tier, price_monthly_cents, price_yearly_cents")
      .eq("id", data.planId)
      .maybeSingle();
    if (!plan) throw new Error("Plano não encontrado");

    if (ws.is_personal && plan.tier === "enterprise") {
      throw new Error("Enterprise disponível apenas para workspaces de empresa.");
    }
    if (!ws.is_personal && plan.tier === "smart") {
      throw new Error("Smart disponível apenas para uso pessoal.");
    }

    const seats = ws.is_personal ? 1 : data.seats;
    const base =
      data.cycle === "yearly" ? plan.price_yearly_cents : plan.price_monthly_cents;

    // Revalida o cupom no servidor (o cliente não define desconto)
    let percentOff = 0;
    let couponCode: string | null = null;
    if (data.couponCode) {
      const code = data.couponCode.trim().toUpperCase();
      const { data: coupon } = await admin
        .from("coupons")
        .select("code, percent_off, valid_until, max_redemptions, redeemed_count")
        .eq("code", code)
        .eq("active", true)
        .maybeSingle();
      const now = Date.now();
      const valid =
        !!coupon &&
        (!coupon.valid_until || new Date(coupon.valid_until).getTime() >= now) &&
        (coupon.max_redemptions == null ||
          (coupon.redeemed_count ?? 0) < coupon.max_redemptions);
      if (valid) {
        percentOff = coupon.percent_off ?? 0;
        couponCode = coupon.code;
      }
    }

    const amountCents = Math.max(0, base - Math.round((base * percentOff) / 100));

    const { data: sub } = await admin
      .from("subscriptions")
      .select("id")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();

    let invoiceId: string | null = null;
    if (sub) {
      const { data: inv } = await admin
        .from("subscription_invoices")
        .insert({
          subscription_id: sub.id,
          amount_cents: amountCents,
          currency: "BRL",
          status: "pending",
        })
        .select("id")
        .single();
      invoiceId = inv?.id ?? null;
    }

    const { data: req, error } = await admin
      .from("subscription_requests")
      .insert({
        workspace_id: data.workspaceId,
        plan_id: plan.id,
        billing_cycle: data.cycle,
        seats,
        coupon_code: couponCode,
        amount_cents: amountCents,
        status: "pending",
        requested_by: context.userId,
        invoice_id: invoiceId,
      })
      .select("id, amount_cents, seats, status")
      .single();
    if (error) throw new Error("Não foi possível registrar a solicitação");

    return {
      ok: true as const,
      requestId: req.id as string,
      amountCents: req.amount_cents as number,
      seats: req.seats as number,
      status: req.status as string,
    };
  });

const reviewSchema = z.object({
  requestId: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
});

/**
 * Confirmação de pagamento: SOMENTE super admin (ou, futuramente, o webhook
 * do gateway) pode ativar a assinatura solicitada.
 */
export const reviewSubscriptionRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => reviewSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: isSuper } = await context.supabase.rpc("is_super_admin", {
      _user_id: context.userId,
    });
    if (!isSuper) throw new Error("Forbidden: super admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: req } = await admin
      .from("subscription_requests")
      .select("*")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!req) throw new Error("Solicitação não encontrada");
    if (req.status !== "pending") throw new Error("Solicitação já revisada");

    if (data.action === "reject") {
      await admin
        .from("subscription_requests")
        .update({
          status: "rejected",
          reviewed_by: context.userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", req.id);
      if (req.invoice_id) {
        await admin
          .from("subscription_invoices")
          .update({ status: "void" })
          .eq("id", req.invoice_id);
      }
      return { ok: true as const, status: "rejected" as const };
    }

    const now = new Date();
    const end = new Date(
      now.getTime() + (req.billing_cycle === "yearly" ? 365 : 30) * 86400000,
    );

    const { error: upErr } = await admin
      .from("subscriptions")
      .update({
        plan_id: req.plan_id,
        status: "active",
        billing_cycle: req.billing_cycle,
        seats: req.seats,
        current_period_start: now.toISOString(),
        current_period_end: end.toISOString(),
        trial_ends_at: null,
        provider: "manual",
      })
      .eq("workspace_id", req.workspace_id);
    if (upErr) throw new Error("Falha ao ativar a assinatura");

    if (req.invoice_id) {
      await admin
        .from("subscription_invoices")
        .update({ status: "paid", paid_at: now.toISOString() })
        .eq("id", req.invoice_id);
    }

    await admin
      .from("subscription_requests")
      .update({
        status: "approved",
        reviewed_by: context.userId,
        reviewed_at: now.toISOString(),
      })
      .eq("id", req.id);

    return { ok: true as const, status: "approved" as const };
  });

const listSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  limit: z.number().int().min(1).max(100).default 20,
});
