import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function sha256Hex(input: string) {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomKey() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `nsb_live_${hex}`;
}

type Sb = import("@supabase/supabase-js").SupabaseClient;

async function assertWorkspaceAdmin(supabase: Sb, userId: string, workspaceId: string) {
  const [{ data: isSuper }, { data: isAdmin }] = await Promise.all([
    supabase.rpc("is_super_admin", { _user_id: userId }),
    supabase.rpc("is_workspace_admin", {
      _user_id: userId,
      _workspace_id: workspaceId,
    }),
  ]);
  if (!isSuper && !isAdmin) {
    throw new Error("Forbidden");
  }
}

export const listApiKeysFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ workspaceId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertWorkspaceAdmin(supabase, userId, data.workspaceId);
    const { data: keys, error } = await supabase
      .from("api_keys")
      .select("id, name, key_prefix, created_at, last_used_at, revoked_at, created_by")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return keys ?? [];
  });

export const createApiKeyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        name: z.string().trim().min(1).max(120),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertWorkspaceAdmin(supabase, userId, data.workspaceId);

    const fullKey = randomKey();
    const keyHash = await sha256Hex(fullKey);
    const keyPrefix = fullKey.slice(0, 16); // "nsb_live_xxxxxxx"

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("api_keys")
      .insert({
        workspace_id: data.workspaceId,
        name: data.name,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        created_by: userId,
      })
      .select("id, name, key_prefix, created_at")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Falha ao criar chave");

    return { ...row, full_key: fullKey };
  });

export const revokeApiKeyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error: fetchErr } = await supabase
      .from("api_keys")
      .select("workspace_id")
      .eq("id", data.id)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!row) throw new Error("Chave não encontrada");
    await assertWorkspaceAdmin(supabase, userId, row.workspace_id);

    const { error } = await supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
