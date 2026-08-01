import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Sb = import("@supabase/supabase-js").SupabaseClient;

async function assertWorkspaceAdmin(supabase: Sb, userId: string, workspaceId: string) {
  const [{ data: isSuper }, { data: isAdmin }] = await Promise.all([
    supabase.rpc("is_super_admin", { _user_id: userId }),
    supabase.rpc("is_workspace_admin", { _user_id: userId, _workspace_id: workspaceId }),
  ]);
  if (!isSuper && !isAdmin) throw new Error("Forbidden");
  return { isSuper: !!isSuper };
}

/** Admin of the workspace + the crm_integration add-on granted (super admins bypass the grant). */
async function assertCrmAccess(supabase: Sb, userId: string, workspaceId: string) {
  const { isSuper } = await assertWorkspaceAdmin(supabase, userId, workspaceId);
  if (isSuper) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!sub) throw new Error("Add-on de integração CRM não habilitado para este workspace");
  const { data: grant } = await supabaseAdmin
    .from("enterprise_module_grants")
    .select("enabled")
    .eq("subscription_id", sub.id)
    .eq("feature_key", "crm_integration")
    .maybeSingle();
  if (!grant?.enabled) {
    throw new Error("Add-on de integração CRM não habilitado para este workspace");
  }
}

const workspaceInput = z.object({ workspaceId: z.string().uuid() });

export const getCrmStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => workspaceInput.parse(raw))
  .handler(async ({ data, context }) => {
    await assertCrmAccess(context.supabase, context.userId, data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("crm_connections")
      .select("id, provider, instance_url, connected_at, connected_by, last_sync_at, status, last_error")
      .eq("workspace_id", data.workspaceId)
      .eq("provider", "salesforce")
      .maybeSingle();
    return {
      connected: !!row && row.status === "active",
      connection: row ?? null,
      credentialsConfigured:
        !!process.env["SALESFORCE_CLIENT_ID"] && !!process.env["SALESFORCE_CLIENT_SECRET"],
    };
  });

export const startCrmOAuthFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => workspaceInput.parse(raw))
  .handler(async ({ data, context }) => {
    await assertCrmAccess(context.supabase, context.userId, data.workspaceId);
    const { getRequest } = await import("@tanstack/react-start/server");
    const { authorizeUrl } = await import("./crm/salesforce.server");
    const { signState } = await import("./crm/crypto.server");
    const origin = new URL(getRequest().url).origin;
    const state = await signState({
      workspaceId: data.workspaceId,
      userId: context.userId,
      origin,
      ts: Date.now(),
    });
    return { url: authorizeUrl(origin, state) };
  });

export const disconnectCrmFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => workspaceInput.parse(raw))
  .handler(async ({ data, context }) => {
    await assertCrmAccess(context.supabase, context.userId, data.workspaceId);
    const { disconnectCrm } = await import("./crm/sync.server");
    await disconnectCrm(data.workspaceId);
    return { ok: true };
  });

export const listCrmMappingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => workspaceInput.parse(raw))
  .handler(async ({ data, context }) => {
    await assertCrmAccess(context.supabase, context.userId, data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("crm_field_mappings")
      .select("id, nsb_object, nsb_field, crm_object, crm_field, sync_direction, created_at")
      .eq("workspace_id", data.workspaceId)
      .eq("provider", "salesforce")
      .order("nsb_object")
      .order("nsb_field");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertCrmMappingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        nsbObject: z.enum(["company", "opportunity"]),
        nsbField: z.string().trim().min(1).max(80),
        crmObject: z.enum(["Account", "Opportunity"]),
        crmField: z.string().trim().min(1).max(120),
        syncDirection: z.enum(["both", "to_crm", "from_crm"]),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    await assertCrmAccess(context.supabase, context.userId, data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("crm_field_mappings").upsert(
      {
        workspace_id: data.workspaceId,
        provider: "salesforce",
        nsb_object: data.nsbObject,
        nsb_field: data.nsbField,
        crm_object: data.crmObject,
        crm_field: data.crmField,
        sync_direction: data.syncDirection,
      },
      { onConflict: "workspace_id,provider,nsb_object,nsb_field" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCrmMappingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ workspaceId: z.string().uuid(), id: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    await assertCrmAccess(context.supabase, context.userId, data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("crm_field_mappings")
      .delete()
      .eq("id", data.id)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCrmSyncLogFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ workspaceId: z.string().uuid(), limit: z.number().int().min(1).max(200).default(50) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    await assertCrmAccess(context.supabase, context.userId, data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("crm_sync_log")
      .select("id, direction, nsb_object, nsb_record_id, crm_record_id, status, detail, synced_at")
      .eq("workspace_id", data.workspaceId)
      .order("synced_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const runCrmInboundSyncFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => workspaceInput.parse(raw))
  .handler(async ({ data, context }) => {
    await assertCrmAccess(context.supabase, context.userId, data.workspaceId);
    const { runInboundSyncForWorkspace } = await import("./crm/sync.server");
    return runInboundSyncForWorkspace(data.workspaceId);
  });

/** Outbound hook: called by the app right after a company/opportunity is saved. */
export const syncRecordToCrmFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        object: z.enum(["company", "opportunity"]),
        recordId: z.string().uuid(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    // Any member who can write the record may trigger its own outbound push.
    const { data: isMember } = await context.supabase.rpc("is_workspace_member", {
      _user_id: context.userId,
      _workspace_id: data.workspaceId,
    });
    if (!isMember) throw new Error("Forbidden");
    const { syncRecordOutbound } = await import("./crm/sync.server");
    return syncRecordOutbound(data.workspaceId, data.object, data.recordId);
  });
