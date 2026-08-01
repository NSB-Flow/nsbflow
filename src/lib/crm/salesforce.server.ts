/**
 * Salesforce OAuth + REST helpers (server-only).
 * Credentials are NSB's Connected App, shared by all workspaces.
 */
import { decryptToken, encryptToken } from "./crypto.server";

const LOGIN_BASE = "https://login.salesforce.com";
const API_VERSION = "v62.0";

export interface CrmConnection {
  id: string;
  workspace_id: string;
  provider: string;
  access_token: string | null;
  refresh_token: string | null;
  instance_url: string | null;
  token_expires_at: string | null;
  last_sync_at: string | null;
  status: string;
}

export function salesforceCredentials() {
  const clientId = process.env["SALESFORCE_CLIENT_ID"];
  const clientSecret = process.env["SALESFORCE_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    throw new Error(
      "Credenciais do Salesforce ausentes. Configure SALESFORCE_CLIENT_ID e SALESFORCE_CLIENT_SECRET.",
    );
  }
  return { clientId, clientSecret };
}

export function redirectUri(origin: string) {
  return process.env["SALESFORCE_REDIRECT_URI"] || `${origin}/api/public/crm/salesforce/callback`;
}

export function authorizeUrl(origin: string, state: string) {
  const { clientId } = salesforceCredentials();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri(origin),
    scope: "api refresh_token offline_access",
    state,
  });
  return `${LOGIN_BASE}/services/oauth2/authorize?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  instance_url: string;
  issued_at?: string;
}

export async function exchangeCode(code: string, origin: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = salesforceCredentials();
  const res = await fetch(`${LOGIN_BASE}/services/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(origin),
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Salesforce token exchange falhou [${res.status}]: ${body}`);
  return JSON.parse(body) as TokenResponse;
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = salesforceCredentials();
  const res = await fetch(`${LOGIN_BASE}/services/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Falha ao renovar token do Salesforce [${res.status}]: ${body}`);
  return JSON.parse(body) as TokenResponse;
}

export async function loadConnection(workspaceId: string): Promise<CrmConnection | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("crm_connections")
    .select("id, workspace_id, provider, access_token, refresh_token, instance_url, token_expires_at, last_sync_at, status")
    .eq("workspace_id", workspaceId)
    .eq("provider", "salesforce")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CrmConnection | null) ?? null;
}

export async function saveConnectionTokens(
  workspaceId: string,
  connectedBy: string,
  tokens: TokenResponse,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const payload = {
    workspace_id: workspaceId,
    provider: "salesforce",
    access_token: await encryptToken(tokens.access_token),
    instance_url: tokens.instance_url,
    connected_by: connectedBy,
    connected_at: new Date().toISOString(),
    status: "active",
    last_error: null,
    ...(tokens.refresh_token
      ? { refresh_token: await encryptToken(tokens.refresh_token) }
      : {}),
  };
  const { error } = await supabaseAdmin
    .from("crm_connections")
    .upsert(payload, { onConflict: "workspace_id,provider" });
  if (error) throw new Error(error.message);
}

export async function markConnectionError(workspaceId: string, message: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("crm_connections")
    .update({ status: "error", last_error: message.slice(0, 500) })
    .eq("workspace_id", workspaceId)
    .eq("provider", "salesforce");
}

/** Authenticated Salesforce REST call with transparent token refresh. */
export async function sfFetch(
  conn: CrmConnection,
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<Response> {
  if (!conn.access_token || !conn.instance_url) throw new Error("Conexão Salesforce incompleta");
  const token = await decryptToken(conn.access_token);
  const url = `${conn.instance_url}/services/data/${API_VERSION}${path}`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body) headers.set("content-type", "application/json");
  const res = await fetch(url, { ...init, headers });

  if (res.status === 401 && retry && conn.refresh_token) {
    const refreshed = await refreshAccessToken(await decryptToken(conn.refresh_token));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("crm_connections")
      .update({
        access_token: await encryptToken(refreshed.access_token),
        instance_url: refreshed.instance_url ?? conn.instance_url,
        status: "active",
        last_error: null,
      })
      .eq("id", conn.id);
    return sfFetch(
      {
        ...conn,
        access_token: await encryptToken(refreshed.access_token),
        instance_url: refreshed.instance_url ?? conn.instance_url,
      },
      path,
      init,
      false,
    );
  }
  return res;
}

async function sfJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) throw new Error(`Salesforce [${res.status}]: ${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export async function soql<T = Record<string, unknown>>(
  conn: CrmConnection,
  query: string,
): Promise<T[]> {
  const res = await sfFetch(conn, `/query?q=${encodeURIComponent(query)}`, { method: "GET" });
  const data = await sfJson<{ records: T[] }>(res);
  return data.records ?? [];
}

export async function createSfRecord(
  conn: CrmConnection,
  object: string,
  fields: Record<string, unknown>,
): Promise<string> {
  const res = await sfFetch(conn, `/sobjects/${object}`, {
    method: "POST",
    body: JSON.stringify(fields),
  });
  const data = await sfJson<{ id: string }>(res);
  return data.id;
}

export async function updateSfRecord(
  conn: CrmConnection,
  object: string,
  id: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const res = await sfFetch(conn, `/sobjects/${object}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Salesforce [${res.status}]: ${(await res.text()).slice(0, 500)}`);
  }
}

export async function getSfRecord<T = Record<string, unknown>>(
  conn: CrmConnection,
  object: string,
  id: string,
  fields: string[],
): Promise<T | null> {
  const res = await sfFetch(
    conn,
    `/sobjects/${object}/${id}?fields=${encodeURIComponent(fields.join(","))}`,
    { method: "GET" },
  );
  if (res.status === 404) return null;
  return sfJson<T>(res);
}
