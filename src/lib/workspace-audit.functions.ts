import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WorkspaceMemberAuditEntry = {
  id: string;
  createdAt: string;
  workspaceId: string;
  action: "added" | "removed" | "role_changed" | "activated" | "deactivated";
  oldRole: string | null;
  newRole: string | null;
  oldActive: boolean | null;
  newActive: boolean | null;
  targetUserId: string;
  targetEmail: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  ip: string | null;
  userAgent: string | null;
};

export type AuditableWorkspace = { id: string; name: string; slug: string };

/** Lista os workspaces que o usuário logado pode auditar. Super admins veem todos; admins veem apenas os seus. */
export const listAuditableWorkspacesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AuditableWorkspace[]> => {
    const { data: isSuper } = await context.supabase.rpc("is_super_admin", {
      _user_id: context.userId,
    });

    if (isSuper) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin
        .from("workspaces")
        .select("id, name, slug")
        .order("name", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    // Admins: only workspaces they administer
    const { data: memberships, error: memErr } = await context.supabase
      .from("workspace_members")
      .select("workspace_id, role, workspaces(id, name, slug)")
      .eq("user_id", context.userId)
      .eq("active", true)
      .in("role", ["super_admin", "admin", "admin_empresa", "ceo", "diretor"]);
    if (memErr) throw new Error(memErr.message);

    return (memberships ?? [])
      .map((m) => {
        const w = Array.isArray(m.workspaces) ? m.workspaces[0] : m.workspaces;
        return w ? { id: w.id, name: w.name, slug: w.slug } : null;
      })
      .filter((x): x is AuditableWorkspace => !!x);
  });

/** Retorna eventos de auditoria de um workspace. RLS já limita ao super_admin ou admin daquele workspace. */
export const getWorkspaceMemberAuditFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ workspaceId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ data, context }): Promise<WorkspaceMemberAuditEntry[]> => {
    // Consulta via RLS-aware client: bloqueia automaticamente quem não pode ler
    const { data: rows, error } = await context.supabase
      .from("workspace_member_audit")
      .select(
        "id, created_at, workspace_id, action, old_role, new_role, old_active, new_active, target_user_id, actor_user_id, ip, user_agent",
      )
      .eq("workspace_id", data.workspaceId)
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
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const u of list.data?.users ?? []) {
        if (ids.has(u.id)) emailById.set(u.id, u.email ?? u.id);
      }
    }

    return (rows ?? []).map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      workspaceId: r.workspace_id,
      action: r.action as WorkspaceMemberAuditEntry["action"],
      oldRole: r.old_role,
      newRole: r.new_role,
      oldActive: r.old_active,
      newActive: r.new_active,
      targetUserId: r.target_user_id,
      targetEmail: emailById.get(r.target_user_id) ?? null,
      actorUserId: r.actor_user_id,
      actorEmail: r.actor_user_id ? emailById.get(r.actor_user_id) ?? null : null,
      ip: r.ip,
      userAgent: r.user_agent,
    }));
  });
