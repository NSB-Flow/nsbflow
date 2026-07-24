import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RoleAuditEntry = {
  id: string;
  createdAt: string;
  action: "granted" | "revoked";
  role: string;
  targetUserId: string;
  targetEmail: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  ip: string | null;
  userAgent: string | null;
};

export const getRoleAuditFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RoleAuditEntry[]> => {
    const { data: isSuper } = await context.supabase.rpc("is_super_admin", {
      _user_id: context.userId,
    });
    if (!isSuper) throw new Error("Forbidden: super admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("user_role_audit")
      .select("id, created_at, action, role, target_user_id, actor_user_id, ip, user_agent")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const ids = new Set<string>();
    for (const r of rows ?? []) {
      if (r.target_user_id) ids.add(r.target_user_id);
      if (r.actor_user_id) ids.add(r.actor_user_id);
    }

    const emailById = new Map<string, string>();
    if (ids.size > 0) {
      const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const u of list.data?.users ?? []) {
        if (ids.has(u.id)) emailById.set(u.id, u.email ?? u.id);
      }
    }

    return (rows ?? []).map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      action: r.action as "granted" | "revoked",
      role: r.role,
      targetUserId: r.target_user_id,
      targetEmail: emailById.get(r.target_user_id) ?? null,
      actorUserId: r.actor_user_id,
      actorEmail: r.actor_user_id ? emailById.get(r.actor_user_id) ?? null : null,
      ip: (r as { ip: string | null }).ip ?? null,
      userAgent: (r as { user_agent: string | null }).user_agent ?? null,
    }));
  });
