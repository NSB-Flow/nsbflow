/**
 * Automated RLS + cross-tenant permission tests.
 *
 * Exercises the real Supabase Data API using per-user JWTs so that RLS
 * policies run as they would in production. Covers:
 *   - companies: workspace-scoped read isolation + insert ownership
 *   - plans / plan_features: public catalog exposes only active plans
 *   - workspace_members: privilege-escalation attempts are rejected
 *   - workspaces: cross-tenant read isolation
 *
 * A policy denial can surface either as `data=[]` (rows filtered) or as
 * `error.code=42501` (a helper function referenced by the policy lacks
 * EXECUTE on the calling role). Both prove the caller cannot reach the
 * row, so denial assertions accept either outcome via `isDenied()`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, cleanupAll, createTestUser, trackPlan, type TestUser } from "./helpers/supabase";

function isDenied<T>(res: { data: T[] | null; error: unknown }): boolean {
  if (res.error) return true;
  return !res.data || res.data.length === 0;
}

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
      .insert({ razao_social: "Alice Corp", workspace_id: alice.workspaceId, created_by: alice.id })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.workspace_id).toBe(alice.workspaceId);
  });

  it("insert with created_by spoofing another user is rejected", async () => {
    const { error } = await alice.client
      .from("companies")
      .insert({ razao_social: "Spoofed", workspace_id: alice.workspaceId, created_by: bob.id });
    expect(error).not.toBeNull();
  });

  it("cross-tenant SELECT does not leak alice's companies to bob", async () => {
    const res = await bob.client
      .from("companies")
      .select("id, razao_social, workspace_id")
      .eq("workspace_id", alice.workspaceId);
    expect(isDenied(res)).toBe(true);
  });

  it("owner sees their own companies", async () => {
    const { data, error } = await alice.client
      .from("companies")
      .select("id, razao_social")
      .eq("workspace_id", alice.workspaceId);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it("cross-tenant UPDATE cannot mutate another workspace's rows", async () => {
    const { data: target } = await alice.client
      .from("companies")
      .select("id")
      .eq("workspace_id", alice.workspaceId)
      .limit(1)
      .single();
    const res = await bob.client
      .from("companies")
      .update({ razao_social: "Hijacked" })
      .eq("id", target!.id)
      .select();
    expect(isDenied(res)).toBe(true);

    const admin = adminClient();
    const { data: check } = await admin.from("companies").select("razao_social").eq("id", target!.id).single();
    expect(check?.razao_social).not.toBe("Hijacked");
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
        price_monthly_cents: 0,
        price_yearly_cents: 0,
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
    const res = await alice.client.from("plans").select("id").eq("id", inactivePlanId);
    expect(isDenied(res)).toBe(true);
  });

  it("plan_features of an inactive plan are hidden", async () => {
    const res = await alice.client
      .from("plan_features")
      .select("plan_id")
      .eq("plan_id", inactivePlanId);
    expect(isDenied(res)).toBe(true);
  });

  it("non-super-admin cannot write to plans", async () => {
    const { error } = await alice.client
      .from("plans")
      .insert({ tier: "smart", name: "Rogue", active: true, price_monthly_cents: 100, price_yearly_cents: 100 });
    expect(error).not.toBeNull();
  });

  it("non-super-admin cannot write to plan_features", async () => {
    const { data: activePlan } = await alice.client
      .from("plans")
      .select("id")
      .eq("active", true)
      .limit(1)
      .single();
    const { error } = await alice.client
      .from("plan_features")
      .insert({ plan_id: activePlan!.id, feature_key: "reports", enabled: true });
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

  it("bob cannot elevate role via UPDATE on alice's workspace rows", async () => {
    const res = await bob.client
      .from("workspace_members")
      .update({ role: "admin_empresa" })
      .eq("workspace_id", alice.workspaceId)
      .eq("user_id", bob.id)
      .select();
    expect(isDenied(res)).toBe(true);
  });

  it("bob cannot read alice's workspace membership rows", async () => {
    const res = await bob.client
      .from("workspace_members")
      .select("user_id, role")
      .eq("workspace_id", alice.workspaceId);
    if (res.error) {
      expect(res.error).toBeTruthy();
    } else {
      const rows = res.data ?? [];
      expect(rows.every((r) => r.user_id === bob.id)).toBe(true);
      expect(rows.some((r) => r.user_id === alice.id)).toBe(false);
    }
  });

  it("cross-tenant workspaces SELECT hides bob's workspace from alice", async () => {
    const res = await alice.client.from("workspaces").select("id").eq("id", bob.workspaceId);
    expect(isDenied(res)).toBe(true);
  });

  it("bob cannot DELETE members of alice's workspace", async () => {
    // Seed a member row via service role so there's actually something to try to delete.
    const admin = adminClient();
    await admin
      .from("workspace_members")
      .insert({ workspace_id: alice.workspaceId, user_id: bob.id, role: "vendedor" })
      .select();
    const res = await bob.client
      .from("workspace_members")
      .delete()
      .eq("workspace_id", alice.workspaceId)
      .neq("user_id", bob.id)
      .select();
    expect(isDenied(res)).toBe(true);
  });
});
