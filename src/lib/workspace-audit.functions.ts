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

export type WorkspaceMemberAuditPage = {
  rows: WorkspaceMemberAuditEntry[];
  total: number;
  page: number;
  pageSize: number;
};

export type AuditableWorkspace = { id: string; name: string; slug: string };

const SORT_COLUMNS = ["created_at", "action"] as const;
export type WorkspaceAuditSort = (typeof SORT_COLUMNS)[number];

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

const auditInputSchema = z.object({
  workspaceId: z.string().uuid(),
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(200).default(50),
  sortBy: z.enum(SORT_COLUMNS).default("created_at"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  action: z
    .enum(["all", "added", "removed", "role_changed", "activated", "deactivated"])
    .default("all"),
  search: z.string().default(""),
});

/** Retorna eventos de auditoria de um workspace, paginados e ordenados no servidor. */
export const getWorkspaceMemberAuditFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => auditInputSchema.parse(raw))
  .handler(async ({ data, context }): Promise<WorkspaceMemberAuditPage> => {
    const from = data.page * data.pageSize;
    const to = from + data.pageSize - 1;

    let q = context.supabase
      .from("workspace_member_audit")
      .select(
        "id, created_at, workspace_id, action, old_role, new_role, old_active, new_active, target_user_id, actor_user_id, ip, user_agent",
        { count: "exact" },
      )
      .eq("workspace_id", data.workspaceId)
      .order(data.sortBy, { ascending: data.sortDir === "asc" })
      .range(from, to);

    if (data.action !== "all") q = q.eq("action", data.action);

    const term = data.search.trim();
    if (term) {
      const like = `%${term}%`;
      q = q.or(
        `old_role.ilike.${like},new_role.ilike.${like},ip.ilike.${like},user_agent.ilike.${like}`,
      );
    }

    const { data: rows, error, count } = await q;
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

    return {
      rows: (rows ?? []).map((r) => ({
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
      })),
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });
