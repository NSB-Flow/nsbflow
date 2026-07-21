/**
 * Automated RLS + cross-tenant permission tests.
 *
 * Exercises the real Supabase Data API using per-user JWTs so that RLS
 * policies run as they would in production. Covers:
 *   - companies: workspace-scoped read isolation + insert ownership
 *   - plans / plan_features: public catalog exposes only active plans
 *   - workspace_members: privilege-escalation attempts are rejected
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, cleanupAll, createTestUser, trackPlan, type TestUser } from "./helpers/supabase";

let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  [alice, bob] = await Promise.all([createTestUser("alice"), createTestUser("bob")]);
});

afterAll(async () => {
  await cleanupAll();
});

describe("companies — workspace-scoped RLS", () => {
  it("owner can insert a company scoped to their own workspace", async () => {
    const { data, error } = await alice.client
      .from("companies")
      .insert({ name: "Alice Corp", workspace_id: alice.workspaceId, created_by: alice.id })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.workspace_id).toBe(alice.workspaceId);
  });

  it("insert with created_by spoofing another user is rejected", async () => {
    const { error } = await alice.client
      .from("companies")
      .insert({ name: "Spoofed", workspace_id: alice.workspaceId, created_by: bob.id });
    expect(error).not.toBeNull();
  });

  it("cross-tenant SELECT returns zero rows (bob cannot read alice's companies)", async () => {
    const { data, error } = await bob.client
      .from("companies")
      .select("id, name, workspace_id")
      .eq("workspace_id", alice.workspaceId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("owner sees their own companies", async () => {
    const { data, error } = await alice.client
      .from("companies")
      .select("id, name")
      .eq("workspace_id", alice.workspaceId);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it("cross-tenant UPDATE is rejected / affects zero rows", async () => {
    const { data: target } = await alice.client
      .from("companies")
      .select("id")
      .eq("workspace_id", alice.workspaceId)
      .limit(1)
      .single();
    const { data: updated } = await bob.client
      .from("companies")
      .update({ name: "Hijacked" })
      .eq("id", target!.id)
      .select();
    expect(updated ?? []).toHaveLength(0);

    const admin = adminClient();
    const { data: check } = await admin.from("companies").select("name").eq("id", target!.id).single();
    expect(check?.name).not.toBe("Hijacked");
  });
});

describe("plans / plan_features — public catalog exposes only active rows", () => {
  let inactivePlanId: string;

  beforeAll(async () => {
    const admin = adminClient();
    const { data, error } = await admin
      .from("plans")
      .insert({
        tier: "smart",
        name: "RLS Test Inactive Plan",
        active: false,
        price_monthly: 0,
        price_yearly: 0,
      })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("plan insert failed");
    inactivePlanId = data.id;
    trackPlan(inactivePlanId);
    await admin
      .from("plan_features")
      .insert({ plan_id: inactivePlanId, feature_key: "reports", enabled: true });
  });

  it("authenticated user sees active plans", async () => {
    const { data, error } = await alice.client.from("plans").select("id, active").eq("active", true);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it("authenticated user cannot see inactive plans", async () => {
    const { data, error } = await alice.client.from("plans").select("id").eq("id", inactivePlanId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("plan_features of an inactive plan are hidden", async () => {
    const { data, error } = await alice.client
      .from("plan_features")
      .select("plan_id")
      .eq("plan_id", inactivePlanId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("non-super-admin cannot write to plans", async () => {
    const { error } = await alice.client
      .from("plans")
      .insert({ tier: "smart", name: "Rogue", active: true, price_monthly: 1, price_yearly: 1 });
    expect(error).not.toBeNull();
  });
});

describe("workspace_members — privilege escalation blocked", () => {
  it("bob cannot self-insert as admin_empresa into alice's workspace", async () => {
    const { error } = await bob.client
      .from("workspace_members")
      .insert({ workspace_id: alice.workspaceId, user_id: bob.id, role: "admin_empresa" });
    expect(error).not.toBeNull();
  });

  it("bob cannot insert an arbitrary user into alice's workspace", async () => {
    const { error } = await bob.client
      .from("workspace_members")
      .insert({ workspace_id: alice.workspaceId, user_id: alice.id, role: "vendedor" });
    expect(error).not.toBeNull();
  });

  it("bob cannot update his own member row to elevate role in alice's workspace", async () => {
    // Precondition: bob is NOT a member of alice's workspace.
    const { data } = await bob.client
      .from("workspace_members")
      .update({ role: "admin_empresa" })
      .eq("workspace_id", alice.workspaceId)
      .eq("user_id", bob.id)
      .select();
    expect(data ?? []).toHaveLength(0);
  });

  it("bob cannot read alice's workspace membership rows", async () => {
    const { data, error } = await bob.client
      .from("workspace_members")
      .select("user_id, role")
      .eq("workspace_id", alice.workspaceId);
    expect(error).toBeNull();
    // Bob should only ever see his own membership rows, none of which are in alice's workspace.
    expect((data ?? []).every((r) => r.user_id === bob.id)).toBe(true);
    expect((data ?? []).some((r) => r.user_id === alice.id)).toBe(false);
  });

  it("workspace owner (alice) can add a member to her own workspace", async () => {
    const { error } = await alice.client
      .from("workspace_members")
      .insert({ workspace_id: alice.workspaceId, user_id: bob.id, role: "vendedor" });
    expect(error).toBeNull();
  });

  it("cross-tenant workspaces SELECT hides bob's workspace from alice", async () => {
    const { data, error } = await alice.client
      .from("workspaces")
      .select("id")
      .eq("id", bob.workspaceId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});
