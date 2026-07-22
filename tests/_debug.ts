import { adminClient, createTestUser, cleanupAll } from "./helpers/supabase";
async function main() {
  const alice = await createTestUser("dbg_alice");
  const bob = await createTestUser("dbg_bob");
  const admin = adminClient();
  const { data: r } = await admin.from("agent_runs").insert({
    agent: "test", workspace_id: alice.workspaceId, created_by: alice.id, payload: {}, status: "success"
  }).select("id").single();
  console.log("alice ws:", alice.workspaceId, "bob ws:", bob.workspaceId, "run:", r?.id);
  const bobView = await bob.client.from("agent_runs").select("id, workspace_id, created_by").eq("id", r!.id);
  console.log("bob view:", JSON.stringify(bobView));
  const { data: mems } = await admin.from("workspace_members").select("workspace_id, role, active").eq("user_id", bob.id);
  console.log("bob memberships:", mems);
  const rpc = await bob.client.rpc("is_workspace_member", { _user_id: bob.id, _workspace_id: alice.workspaceId });
  console.log("bob is_member(alice ws):", JSON.stringify(rpc));
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", bob.id);
  console.log("bob roles:", roles);
  await cleanupAll();
}
main().catch(e => { console.error(e); process.exit(1); });
