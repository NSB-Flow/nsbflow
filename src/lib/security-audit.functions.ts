import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SecurityEvent = {
  ts: string;
  category: "signup" | "login" | "membership" | "role_grant" | "referral";
  actor: string | null;
  target: string | null;
  detail: string;
  ip: string | null;
};

export const getSecurityEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SecurityEvent[]> => {
    const { data: isSuper, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (roleErr || !isSuper) {
      throw new Response("Forbidden", { status: 403 });
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Pull recent activity from admin API + DB tables.
    const [usersRes, membersRes, rolesRes, refsRes] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 }),
      supabaseAdmin
        .from("workspace_members")
        .select("user_id, workspace_id, role, active, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("user_roles")
        .select("user_id, role, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("referrals")
        .select("referrer_user_id, referred_user_id, code, status, credits_awarded, signed_up_at, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const userMap = new Map<string, string>();
    for (const u of usersRes.data?.users ?? []) userMap.set(u.id, u.email ?? u.id);
    const who = (id: string | null | undefined) => (id ? userMap.get(id) ?? id : null);

    const events: SecurityEvent[] = [];

    for (const u of usersRes.data?.users ?? []) {
      events.push({
        ts: u.created_at,
        category: "signup",
        actor: u.email ?? u.id,
        target: null,
        detail: u.email_confirmed_at ? "email confirmado" : "aguardando confirmação",
        ip: (u.user_metadata as any)?.ip ?? null,
      });
      if (u.last_sign_in_at) {
        events.push({
          ts: u.last_sign_in_at,
          category: "login",
          actor: u.email ?? u.id,
          target: null,
          detail: `provider: ${u.app_metadata?.provider ?? "email"}`,
          ip: null,
        });
      }
    }

    for (const m of membersRes.data ?? []) {
      const changed = m.updated_at !== m.created_at;
      events.push({
        ts: m.updated_at ?? m.created_at,
        category: "membership",
        actor: who(m.user_id),
        target: m.workspace_id,
        detail: `${changed ? "atualizado" : "adicionado"} — role=${m.role} active=${m.active}`,
        ip: null,
      });
    }

    for (const r of rolesRes.data ?? []) {
      events.push({
        ts: r.created_at,
        category: "role_grant",
        actor: who(r.user_id),
        target: null,
        detail: `role atribuída: ${r.role}`,
        ip: null,
      });
    }

    for (const r of refsRes.data ?? []) {
      events.push({
        ts: r.signed_up_at ?? r.created_at,
        category: "referral",
        actor: who(r.referrer_user_id),
        target: who(r.referred_user_id),
        detail: `código=${r.code} status=${r.status} créditos=${r.credits_awarded ?? 0}`,
        ip: null,
      });
    }

    events.sort((a, b) => (a.ts < b.ts ? 1 : -1));
    return events.slice(0, 500);
  });
