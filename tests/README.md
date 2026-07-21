# RLS & cross-tenant permission tests

Automated integration tests that exercise the real Supabase Data API using
per-user JWTs so Row-Level Security policies run as they would in production.

## Coverage

- `companies` — workspace-scoped SELECT/UPDATE isolation, `created_by` spoof rejection
- `plans` / `plan_features` — only active plans exposed to non-admins, writes blocked
- `workspace_members` — privilege-escalation inserts/updates blocked, owner can invite
- `workspaces` — cross-tenant read isolation

## Run

```bash
bunx vitest run tests/rls.test.ts
```

Requires these env vars (already present in the Lovable sandbox):

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` (or `VITE_SUPABASE_PUBLISHABLE_KEY`)
- `SUPABASE_SERVICE_ROLE_KEY`

The suite creates two throwaway users (`rlstest_*@example.test`), performs its
assertions, and deletes every user / workspace / plan it created in `afterAll`.
