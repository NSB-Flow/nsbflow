import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Sb = import("@supabase/supabase-js").SupabaseClient;

const PROVIDERS = ["microsoft", "zoom", "google"] as const;
const PLATFORMS = ["teams", "zoom", "google_meet"] as const;

/** Member of the workspace + the native_meeting_capture add-on (super admins bypass). */
async function assertCaptureAccess(supabase: Sb, userId: string, workspaceId: string) {
  const [{ data: isSuper }, { data: isMember }] = await Promise.all([
    supabase.rpc("is_super_admin", { _user_id: userId }),
    supabase.rpc("is_workspace_member", { _user_id: userId, _workspace_id: workspaceId }),
  ]);
  if (isSuper) return { isSuper: true };
  if (!isMember) throw new Error("Forbidden");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const { data: grant } = sub
    ? await supabaseAdmin
        .from("enterprise_module_grants")
        .select("enabled")
        .eq("subscription_id", sub.id)
        .eq("feature_key", "native_meeting_capture")
        .maybeSingle()
    : { data: null };
  if (!grant?.enabled) {
    throw new Error("Add-on de captura nativa de reuniões não habilitado para este workspace");
  }
  return { isSuper: false };
}

const workspaceInput = z.object({ workspaceId: z.string().uuid() });

export const getMeetingConnectionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => workspaceInput.parse(raw))
  .handler(async ({ data, context }) => {
    await assertCaptureAccess(context.supabase, context.userId, data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { credentialsConfigured } = await import("./meetings/providers.server");
    const { data: rows } = await supabaseAdmin
      .from("meeting_platform_connections")
      .select("provider, external_account_email, connected_at, status, last_error")
      .eq("user_id", context.userId);
    return PROVIDERS.map((provider) => {
      const row = (rows ?? []).find((r) => r.provider === provider);
      return {
        provider,
        connected: !!row && row.status === "active",
        email: row?.external_account_email ?? null,
        connectedAt: row?.connected_at ?? null,
        lastError: row?.last_error ?? null,
        credentialsConfigured: credentialsConfigured(provider),
      };
    });
  });

export const startMeetingOAuthFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ workspaceId: z.string().uuid(), provider: z.enum(PROVIDERS) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    await assertCaptureAccess(context.supabase, context.userId, data.workspaceId);
    const { getRequest } = await import("@tanstack/react-start/server");
    const { authorizeUrl } = await import("./meetings/providers.server");
    const { signState } = await import("./crm/crypto.server");
    const origin = new URL(getRequest().url).origin;
    const state = await signState({
      workspaceId: data.workspaceId,
      userId: context.userId,
      provider: data.provider,
      origin,
      ts: Date.now(),
    });
    return { url: authorizeUrl(origin, data.provider, state) };
  });

export const disconnectMeetingProviderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ workspaceId: z.string().uuid(), provider: z.enum(PROVIDERS) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    await assertCaptureAccess(context.supabase, context.userId, data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("meeting_platform_connections")
      .delete()
      .eq("user_id", context.userId)
      .eq("provider", data.provider);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createMeetingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        companyId: z.string().uuid(),
        opportunityId: z.string().uuid().nullable().optional(),
        platform: z.enum(PLATFORMS),
        meetingLink: z.string().trim().url().max(1000),
        scheduledAt: z.string().datetime().nullable().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    await assertCaptureAccess(context.supabase, context.userId, data.workspaceId);
    const { PLATFORM_PROVIDER, extractExternalId } = await import("./meetings/providers.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const provider = PLATFORM_PROVIDER[data.platform];
    const { data: conn } = await supabaseAdmin
      .from("meeting_platform_connections")
      .select("status")
      .eq("user_id", context.userId)
      .eq("provider", provider)
      .maybeSingle();
    if (!conn || conn.status !== "active") {
      throw new Error(`Conecte sua conta ${provider} antes de agendar esta reunião`);
    }

    // RLS-scoped insert (as the user), so workspace/company scoping is enforced.
    const { data: row, error } = await context.supabase
      .from("meetings")
      .insert({
        workspace_id: data.workspaceId,
        company_id: data.companyId,
        opportunity_id: data.opportunityId ?? null,
        created_by: context.userId,
        platform: data.platform,
        meeting_link: data.meetingLink,
        external_meeting_id: extractExternalId(data.platform, data.meetingLink),
        scheduled_at: data.scheduledAt ?? null,
        status: "scheduled",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const fetchMeetingTranscriptNowFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ workspaceId: z.string().uuid(), meetingId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    await assertCaptureAccess(context.supabase, context.userId, data.workspaceId);
    // The user must be able to see the meeting under RLS before we poll it.
    const { data: visible, error } = await context.supabase
      .from("meetings")
      .select("id")
      .eq("id", data.meetingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!visible) throw new Error("Reunião não encontrada");
    const { pollTranscripts } = await import("./meetings/transcripts.server");
    return pollTranscripts(data.meetingId);
  });
