import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import "dotenv/config";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!;
const ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  throw new Error(
    "Missing Supabase env vars. Need SUPABASE_URL, (VITE_)SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY.",
  );
}

// Opaque sb_ keys aren't JWTs — send them only as apikey, never Authorization bearer.
function makeFetch(key: string): typeof fetch {
  const opaque = key.startsWith("sb_publishable_") || key.startsWith("sb_secret_");
  return (input, init) => {
    const headers = new Headers(init?.headers);
    if (opaque && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: makeFetch(SERVICE_KEY) },
  });
}

export function anonClient(accessToken?: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: makeFetch(ANON_KEY),
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
  });
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  accessToken: string;
  client: SupabaseClient;
  workspaceId: string;
}

const RUN_ID = `rlstest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const createdUserIds: string[] = [];
const createdWorkspaceIds: string[] = [];
const createdPlanIds: string[] = [];

export function trackWorkspace(id: string) {
  createdWorkspaceIds.push(id);
}
export function trackPlan(id: string) {
  createdPlanIds.push(id);
}

export async function createTestUser(label: string): Promise<TestUser> {
  const admin = adminClient();
  const email = `${RUN_ID}+${label}@example.test`;
  const password = `Passw0rd!${Math.random().toString(36).slice(2, 10)}`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `RLS Test ${label}` },
  });
  if (createErr || !created.user) throw createErr ?? new Error("createUser failed");
  const userId = created.user.id;
  createdUserIds.push(userId);

  // Sign in via anon client to get a real user JWT.
  const auth = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { fetch: makeFetch(ANON_KEY) },
  });
  const { data: sess, error: signErr } = await auth.auth.signInWithPassword({ email, password });
  if (signErr || !sess.session) throw signErr ?? new Error("signIn failed");
  const accessToken = sess.session.access_token;

  // handle_new_user trigger seeded a personal workspace + member row.
  const { data: ws, error: wsErr } = await admin
    .from("workspaces")
    .select("id")
    .eq("owner_user_id", userId)
    .limit(1)
    .maybeSingle();
  if (wsErr) throw wsErr;
  if (!ws) throw new Error(`No workspace auto-created for ${label}`);
  createdWorkspaceIds.push(ws.id);

  return {
    id: userId,
    email,
    password,
    accessToken,
    client: anonClient(accessToken),
    workspaceId: ws.id,
  };
}

export async function cleanupAll() {
  const admin = adminClient();
  if (createdWorkspaceIds.length) {
    await admin.from("companies").delete().in("workspace_id", createdWorkspaceIds);
    await admin.from("workspace_members").delete().in("workspace_id", createdWorkspaceIds);
    await admin.from("subscriptions").delete().in("workspace_id", createdWorkspaceIds);
    await admin.from("workspaces").delete().in("id", createdWorkspaceIds);
  }
  if (createdPlanIds.length) {
    await admin.from("plan_features").delete().in("plan_id", createdPlanIds);
    await admin.from("plans").delete().in("id", createdPlanIds);
  }
  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
}
