/**
 * OAuth + transcript helpers for remote meeting platforms (server-only).
 * Credentials are NSB's own apps, shared by all workspaces; each *user*
 * connects their own account (meeting agendas belong to the individual).
 */
import { decryptToken, encryptToken } from "@/lib/crm/crypto.server";

export type MeetingProvider = "microsoft" | "zoom" | "google";
export type MeetingPlatform = "teams" | "zoom" | "google_meet";

export const PLATFORM_PROVIDER: Record<MeetingPlatform, MeetingProvider> = {
  teams: "microsoft",
  zoom: "zoom",
  google_meet: "google",
};

export const PROVIDER_LABEL: Record<MeetingProvider, string> = {
  microsoft: "Microsoft 365",
  zoom: "Zoom",
  google: "Google Workspace",
};

const SCOPES: Record<MeetingProvider, string> = {
  microsoft: [
    "offline_access",
    "openid",
    "email",
    "User.Read",
    "OnlineMeetings.Read",
    "OnlineMeetingTranscript.Read.All",
  ].join(" "),
  zoom: "user:read recording:read",
  google: [
    "openid",
    "email",
    "https://www.googleapis.com/auth/meetings.space.readonly",
  ].join(" "),
};

export function providerCredentials(provider: MeetingProvider) {
  const prefix = provider === "microsoft" ? "MICROSOFT" : provider === "zoom" ? "ZOOM" : "GOOGLE";
  const clientId = process.env[`${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
  if (!clientId || !clientSecret) {
    throw new Error(
      `Credenciais ausentes. Configure ${prefix}_CLIENT_ID e ${prefix}_CLIENT_SECRET.`,
    );
  }
  return { clientId, clientSecret };
}

export function credentialsConfigured(provider: MeetingProvider): boolean {
  const prefix = provider === "microsoft" ? "MICROSOFT" : provider === "zoom" ? "ZOOM" : "GOOGLE";
  return !!process.env[`${prefix}_CLIENT_ID`] && !!process.env[`${prefix}_CLIENT_SECRET`];
}

export function redirectUri(origin: string, provider: MeetingProvider) {
  return `${origin}/api/public/meetings/oauth/${provider}`;
}

export function authorizeUrl(origin: string, provider: MeetingProvider, state: string) {
  const { clientId } = providerCredentials(provider);
  const redirect = redirectUri(origin, provider);
  if (provider === "microsoft") {
    const p = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirect,
      response_mode: "query",
      scope: SCOPES.microsoft,
      state,
      prompt: "select_account",
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${p}`;
  }
  if (provider === "zoom") {
    const p = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirect,
      state,
    });
    return `https://zoom.us/oauth/authorize?${p}`;
  }
  const p = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirect,
    scope: SCOPES.google,
    state,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  email: string | null;
}

function tokenEndpoint(provider: MeetingProvider) {
  if (provider === "microsoft") return "https://login.microsoftonline.com/common/oauth2/v2.0/token";
  if (provider === "zoom") return "https://zoom.us/oauth/token";
  return "https://oauth2.googleapis.com/token";
}

async function postToken(provider: MeetingProvider, body: URLSearchParams): Promise<TokenSet> {
  const { clientId, clientSecret } = providerCredentials(provider);
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };
  if (provider === "zoom") {
    headers["authorization"] = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
  } else {
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
  }
  const res = await fetch(tokenEndpoint(provider), { method: "POST", headers, body });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (json["error_description"] ?? json["error"] ?? res.statusText) as string;
    throw new Error(`OAuth ${provider}: ${String(msg)}`);
  }
  const accessToken = json["access_token"] as string;
  if (!accessToken) throw new Error(`OAuth ${provider}: resposta sem access_token`);
  const expiresIn = Number(json["expires_in"] ?? 3600);
  return {
    accessToken,
    refreshToken: (json["refresh_token"] as string | undefined) ?? null,
    expiresAt: new Date(Date.now() + Math.max(60, expiresIn - 60) * 1000).toISOString(),
    email: null,
  };
}

export async function exchangeCode(
  provider: MeetingProvider,
  code: string,
  origin: string,
): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(origin, provider),
  });
  const tokens = await postToken(provider, body);
  tokens.email = await fetchAccountEmail(provider, tokens.accessToken);
  return tokens;
}

async function refresh(provider: MeetingProvider, refreshToken: string): Promise<TokenSet> {
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
  if (provider === "microsoft") body.set("scope", SCOPES.microsoft);
  return postToken(provider, body);
}

async function fetchAccountEmail(provider: MeetingProvider, accessToken: string) {
  try {
    const auth = { authorization: `Bearer ${accessToken}` };
    if (provider === "microsoft") {
      const r = await fetch("https://graph.microsoft.com/v1.0/me", { headers: auth });
      const j = (await r.json()) as { mail?: string; userPrincipalName?: string };
      return j.mail ?? j.userPrincipalName ?? null;
    }
    if (provider === "zoom") {
      const r = await fetch("https://api.zoom.us/v2/users/me", { headers: auth });
      const j = (await r.json()) as { email?: string };
      return j.email ?? null;
    }
    const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: auth });
    const j = (await r.json()) as { email?: string };
    return j.email ?? null;
  } catch {
    return null;
  }
}

export interface ConnectionRow {
  id: string;
  user_id: string;
  workspace_id: string;
  provider: MeetingProvider;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  status: string;
}

export async function saveConnection(
  workspaceId: string,
  userId: string,
  provider: MeetingProvider,
  tokens: TokenSet,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("meeting_platform_connections").upsert(
    {
      workspace_id: workspaceId,
      user_id: userId,
      provider,
      access_token: await encryptToken(tokens.accessToken),
      refresh_token: tokens.refreshToken ? await encryptToken(tokens.refreshToken) : null,
      token_expires_at: tokens.expiresAt,
      external_account_email: tokens.email,
      status: "active",
      last_error: null,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  );
  if (error) throw new Error(error.message);
}

/** Returns a usable access token, refreshing (and persisting) it when needed. */
export async function validAccessToken(conn: ConnectionRow): Promise<string> {
  const stillValid =
    conn.token_expires_at && new Date(conn.token_expires_at).getTime() > Date.now() + 60_000;
  if (conn.access_token && stillValid) return decryptToken(conn.access_token);
  if (!conn.refresh_token) {
    if (conn.access_token) return decryptToken(conn.access_token);
    throw new Error("Conexão sem token válido — reconecte a conta");
  }
  const tokens = await refresh(conn.provider, await decryptToken(conn.refresh_token));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("meeting_platform_connections")
    .update({
      access_token: await encryptToken(tokens.accessToken),
      refresh_token: tokens.refreshToken
        ? await encryptToken(tokens.refreshToken)
        : conn.refresh_token,
      token_expires_at: tokens.expiresAt,
    })
    .eq("id", conn.id);
  return tokens.accessToken;
}

/** Best-effort platform meeting id extracted from the join link. */
export function extractExternalId(platform: MeetingPlatform, link: string): string | null {
  try {
    if (platform === "zoom") {
      const m = link.match(/\/j\/(\d{9,})/) ?? link.match(/(\d{9,})/);
      return m?.[1] ?? null;
    }
    if (platform === "google_meet") {
      const m = link.match(/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
      return m?.[1]?.toLowerCase() ?? null;
    }
    // Teams: the thread id lives in the path and is URL-encoded.
    const m = link.match(/\/l\/meetup-join\/([^/]+)/) ?? link.match(/\/meet\/(\d+)/);
    return m?.[1] ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

function vttToText(vtt: string): string {
  const lines = vtt.split(/\r?\n/);
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^WEBVTT/i.test(line) || /^NOTE\b/i.test(line)) continue;
    if (/^\d+$/.test(line)) continue;
    if (/-->/.test(line)) continue;
    out.push(line.replace(/<[^>]+>/g, ""));
  }
  return out.join("\n").trim();
}

export interface TranscriptResult {
  text: string | null;
  externalId?: string | null;
}

/** Microsoft Graph: resolve the online meeting by join URL, then read transcripts. */
async function fetchTeamsTranscript(token: string, meetingLink: string): Promise<TranscriptResult> {
  const headers = { authorization: `Bearer ${token}` };
  const filter = encodeURIComponent(`JoinWebUrl eq '${meetingLink}'`);
  const lookup = await fetch(`https://graph.microsoft.com/v1.0/me/onlineMeetings?$filter=${filter}`, {
    headers,
  });
  if (!lookup.ok) throw new Error(`Graph onlineMeetings: ${lookup.status}`);
  const list = (await lookup.json()) as { value?: Array<{ id: string }> };
  const meetingId = list.value?.[0]?.id;
  if (!meetingId) return { text: null };

  const tr = await fetch(
    `https://graph.microsoft.com/v1.0/me/onlineMeetings/${meetingId}/transcripts`,
    { headers },
  );
  if (!tr.ok) throw new Error(`Graph transcripts: ${tr.status}`);
  const trJson = (await tr.json()) as { value?: Array<{ id: string }> };
  const transcriptId = trJson.value?.[0]?.id;
  if (!transcriptId) return { text: null, externalId: meetingId };

  const content = await fetch(
    `https://graph.microsoft.com/v1.0/me/onlineMeetings/${meetingId}/transcripts/${transcriptId}/content?$format=text/vtt`,
    { headers },
  );
  if (!content.ok) throw new Error(`Graph transcript content: ${content.status}`);
  return { text: vttToText(await content.text()) || null, externalId: meetingId };
}

/** Zoom Cloud Recording: pick the TRANSCRIPT file and download it. */
async function fetchZoomTranscript(token: string, meetingId: string): Promise<TranscriptResult> {
  const headers = { authorization: `Bearer ${token}` };
  const res = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}/recordings`, { headers });
  if (res.status === 404) return { text: null };
  if (!res.ok) throw new Error(`Zoom recordings: ${res.status}`);
  const json = (await res.json()) as {
    recording_files?: Array<{ file_type?: string; download_url?: string; status?: string }>;
  };
  const file = json.recording_files?.find(
    (f) => (f.file_type ?? "").toUpperCase() === "TRANSCRIPT" && f.download_url,
  );
  if (!file?.download_url) return { text: null };
  const dl = await fetch(file.download_url, { headers });
  if (!dl.ok) throw new Error(`Zoom transcript download: ${dl.status}`);
  return { text: vttToText(await dl.text()) || null };
}

/** Google Meet REST API: conference record by meeting code, then transcript entries. */
async function fetchGoogleMeetTranscript(token: string, code: string): Promise<TranscriptResult> {
  const headers = { authorization: `Bearer ${token}` };
  const filter = encodeURIComponent(`space.meeting_code = "${code.replace(/-/g, "")}"`);
  const rec = await fetch(
    `https://meet.googleapis.com/v2/conferenceRecords?filter=${filter}&pageSize=5`,
    { headers },
  );
  if (!rec.ok) throw new Error(`Meet conferenceRecords: ${rec.status}`);
  const recJson = (await rec.json()) as { conferenceRecords?: Array<{ name: string }> };
  const record = recJson.conferenceRecords?.[0]?.name;
  if (!record) return { text: null };

  const tr = await fetch(`https://meet.googleapis.com/v2/${record}/transcripts`, { headers });
  if (!tr.ok) throw new Error(`Meet transcripts: ${tr.status}`);
  const trJson = (await tr.json()) as { transcripts?: Array<{ name: string; state?: string }> };
  const transcript = trJson.transcripts?.find((t) => t.state !== "STARTED") ?? trJson.transcripts?.[0];
  if (!transcript) return { text: null, externalId: record };

  const parts: string[] = [];
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({ pageSize: "1000" });
    if (pageToken) q.set("pageToken", pageToken);
    const ent = await fetch(`https://meet.googleapis.com/v2/${transcript.name}/entries?${q}`, {
      headers,
    });
    if (!ent.ok) throw new Error(`Meet transcript entries: ${ent.status}`);
    const entJson = (await ent.json()) as {
      transcriptEntries?: Array<{ text?: string; participant?: string }>;
      nextPageToken?: string;
    };
    for (const e of entJson.transcriptEntries ?? []) if (e.text) parts.push(e.text);
    pageToken = entJson.nextPageToken;
  } while (pageToken);

  return { text: parts.join("\n").trim() || null, externalId: record };
}

export async function fetchTranscript(
  platform: MeetingPlatform,
  token: string,
  meetingLink: string,
  externalId: string | null,
): Promise<TranscriptResult> {
  if (platform === "teams") return fetchTeamsTranscript(token, meetingLink);
  if (platform === "zoom") {
    const id = externalId ?? extractExternalId("zoom", meetingLink);
    if (!id) throw new Error("Não foi possível identificar o ID da reunião no link do Zoom");
    return fetchZoomTranscript(token, id);
  }
  const code = extractExternalId("google_meet", meetingLink);
  if (!code) throw new Error("Não foi possível identificar o código da reunião no link do Meet");
  return fetchGoogleMeetTranscript(token, code);
}

/* ---------------------------------------------------------------------------
 * Connection diagnostics ("Testar conexão")
 * ------------------------------------------------------------------------- */

export interface ProbeCheck {
  label: string;
  scope: string;
  ok: boolean;
  status: number | null;
  ms: number;
  detail: string | null;
}

export interface ProbeResult {
  provider: MeetingProvider;
  ok: boolean;
  email: string | null;
  totalMs: number;
  checks: ProbeCheck[];
  error: string | null;
}

async function timedGet(
  label: string,
  scope: string,
  url: string,
  token: string,
  okStatuses: number[] = [200],
): Promise<ProbeCheck> {
  const started = Date.now();
  try {
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    const ms = Date.now() - started;
    if (okStatuses.includes(res.status)) {
      return { label, scope, ok: true, status: res.status, ms, detail: null };
    }
    const body = (await res.text().catch(() => "")).slice(0, 180);
    return { label, scope, ok: false, status: res.status, ms, detail: body || res.statusText };
  } catch (e) {
    return {
      label,
      scope,
      ok: false,
      status: null,
      ms: Date.now() - started,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Read-only permission/latency probe for one user connection. */
export async function probeConnection(conn: ConnectionRow): Promise<ProbeResult> {
  const started = Date.now();
  const base: ProbeResult = {
    provider: conn.provider,
    ok: false,
    email: null,
    totalMs: 0,
    checks: [],
    error: null,
  };

  let token: string;
  try {
    token = await validAccessToken(conn);
  } catch (e) {
    base.totalMs = Date.now() - started;
    base.error = e instanceof Error ? e.message : String(e);
    return base;
  }

  if (conn.provider === "microsoft") {
    base.checks = await Promise.all([
      timedGet("Perfil da conta", "User.Read", "https://graph.microsoft.com/v1.0/me", token),
      timedGet(
        "Reuniões online",
        "OnlineMeetings.Read",
        "https://graph.microsoft.com/v1.0/me/onlineMeetings?$top=1",
        token,
        [200, 400],
      ),
    ]);
  } else if (conn.provider === "zoom") {
    base.checks = await Promise.all([
      timedGet("Perfil da conta", "user:read", "https://api.zoom.us/v2/users/me", token),
      timedGet(
        "Gravações na nuvem",
        "recording:read",
        "https://api.zoom.us/v2/users/me/recordings?page_size=1",
        token,
      ),
    ]);
  } else {
    base.checks = await Promise.all([
      timedGet(
        "Perfil da conta",
        "openid email",
        "https://openidconnect.googleapis.com/v1/userinfo",
        token,
      ),
      timedGet(
        "Registros de conferência",
        "meetings.space.readonly",
        "https://meet.googleapis.com/v2/conferenceRecords?pageSize=1",
        token,
      ),
    ]);
  }

  base.email = await fetchAccountEmail(conn.provider, token);
  base.ok = base.checks.every((c) => c.ok);
  base.totalMs = Date.now() - started;
  if (!base.ok) {
    base.error = base.checks.find((c) => !c.ok)?.detail ?? "Verificação falhou";
  }
  return base;
}
