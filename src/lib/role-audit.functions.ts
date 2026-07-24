import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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

export type RoleAuditPage = {
  rows: RoleAuditEntry[];
  total: number;
  page: number;
  pageSize: number;
};

const SORT_COLUMNS = ["created_at", "action", "role"] as const;
export type RoleAuditSort = (typeof SORT_COLUMNS)[number];

const inputSchema = z.object({
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(200).default(50),
  sortBy: z.enum(SORT_COLUMNS).default("created_at"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  action: z.enum(["all", "granted", "revoked"]).default("all"),
  search: z.string().default(""),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
});


export const getRoleAuditFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => inputSchema.parse(raw ?? {}))
  .handler(async ({ data, context }): Promise<RoleAuditPage> => {
    const { data: isSuper } = await context.supabase.rpc("is_super_admin", {
      _user_id: context.userId,
    });
    if (!isSuper) throw new Error("Forbidden: super admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const from = data.page * data.pageSize;
    const to = from + data.pageSize - 1;

    let q = supabaseAdmin
      .from("user_role_audit")
      .select(
        "id, created_at, action, role, target_user_id, actor_user_id, ip, user_agent",
        { count: "exact" },
      )
      .order(data.sortBy, { ascending: data.sortDir === "asc" })
      .range(from, to);

    if (data.action !== "all") q = q.eq("action", data.action);

    const term = data.search.trim();
    if (term) {
      // Search on server-side columns; email search is done client-side after join
      const like = `%${term}%`;
      q = q.or(`role.ilike.${like},ip.ilike.${like},user_agent.ilike.${like}`);
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
      const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const u of list.data?.users ?? []) {
        if (ids.has(u.id)) emailById.set(u.id, u.email ?? u.id);
      }
    }

    return {
      rows: (rows ?? []).map((r) => ({
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
      })),
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });
