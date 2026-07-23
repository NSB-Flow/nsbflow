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
    const { data: roleRow, error: roleErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "super_admin")
      .maybeSingle();
    if (roleErr) throw new Error(roleErr.message);
    if (!roleRow) throw new Error("Forbidden: super admin only");

    // Note: SUPABASE_SERVICE_ROLE_KEY is not available on Lovable Cloud,
    // so we cannot call auth.admin.listUsers(). We source events from
    // public tables (readable to super_admin via RLS) and resolve display
    // names via public.profiles.
    const sb = context.supabase;

    const [membersRes, rolesRes, refsRes, profilesRes] = await Promise.all([
      sb
        .from("workspace_members")
        .select("user_id, workspace_id, role, active, joined_at, invited_by")
        .order("joined_at", { ascending: false })
        .limit(200),
      sb
        .from("user_roles")
        .select("user_id, role, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      sb
        .from("referrals")
        .select("referrer_user_id, referred_user_id, code, status, credits_awarded, signed_up_at, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      sb.from("profiles").select("id, full_name").limit(1000),
    ]);

    const nameMap = new Map<string, string>();
    for (const p of profilesRes.data ?? []) {
      if (p.id) nameMap.set(p.id, p.full_name ?? p.id);
    }
    const who = (id: string | null | undefined) => (id ? nameMap.get(id) ?? id : null);

    const events: SecurityEvent[] = [];

    for (const m of membersRes.data ?? []) {
      events.push({
        ts: m.joined_at,
        category: "membership",
        actor: who(m.user_id),
        target: m.workspace_id,
        detail: `role=${m.role} active=${m.active}${m.invited_by ? ` (por ${who(m.invited_by)})` : ""}`,
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
