// Server-only helper for validating public API keys.
// Only import from server routes / server functions.
import { createHash } from "node:crypto";

export type ApiKeyContext = {
  workspaceId: string;
  apiKeyId: string;
};

function sha256Hex(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

const MODULE_KEY = "data_export_api";

// Very light in-memory rate limit (best-effort; per worker instance).
const RATE_BUCKET = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_PER_MIN = 120;

function rateLimit(keyId: string): boolean {
  const now = Date.now();
  const bucket = RATE_BUCKET.get(keyId);
  if (!bucket || bucket.resetAt < now) {
    RATE_BUCKET.set(keyId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_PER_MIN) return false;
  bucket.count += 1;
  return true;
}

export function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Validates the request's `Authorization: Bearer <key>` header, ensures the
 * key isn't revoked, confirms the workspace has an active
 * `data_export_api` grant, and updates last_used_at.
 * Returns { workspaceId } on success or a Response to short-circuit.
 */
export async function authenticateApiKey(
  request: Request,
): Promise<ApiKeyContext | Response> {
  const auth = request.headers.get("authorization");
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
    return jsonError(401, "Missing or invalid Authorization header");
  }
  const token = auth.slice(7).trim();
  if (!token) return jsonError(401, "Missing API key");

  const hash = sha256Hex(token);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: keyRow, error } = await supabaseAdmin
    .from("api_keys")
    .select("id, workspace_id, revoked_at")
    .eq("key_hash", hash)
    .maybeSingle();

  if (error) return jsonError(500, "Internal error");
  if (!keyRow) return jsonError(401, "Invalid API key");
  if (keyRow.revoked_at) return jsonError(401, "API key revoked");

  if (!rateLimit(keyRow.id)) {
    return jsonError(429, "Rate limit exceeded");
  }

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("id")
    .eq("workspace_id", keyRow.workspace_id)
    .maybeSingle();

  let hasGrant = false;
  if (sub) {
    const { data: g } = await supabaseAdmin
      .from("enterprise_module_grants")
      .select("enabled")
      .eq("subscription_id", sub.id)
      .eq("feature_key", MODULE_KEY)
      .maybeSingle();
    hasGrant = !!g?.enabled;
  }

  if (!hasGrant) {
    return jsonError(403, "Data Export API not enabled for this workspace");
  }

  // Fire-and-forget last_used_at update
  supabaseAdmin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRow.id)
    .then(() => {});

  return { workspaceId: keyRow.workspace_id, apiKeyId: keyRow.id };
}

export function parsePagination(url: URL) {
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 500);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
  const from = url.searchParams.get("from"); // ISO date
  const to = url.searchParams.get("to");
  return { limit, offset, from, to };
}

export function jsonOk(data: unknown, meta?: Record<string, unknown>) {
  return new Response(JSON.stringify({ data, ...(meta ? { meta } : {}) }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
