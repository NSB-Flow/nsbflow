/**
 * Shared-secret guard for internal automation endpoints (`/api/public/hooks/*`).
 * The `/api/public/*` prefix bypasses site auth, so each hook must verify the
 * caller itself. Only pg_cron (and internal server code) knows CRON_SECRET.
 */
export function assertCronCaller(request: Request): Response | null {
  const expected = process.env["CRON_SECRET"];
  if (!expected) {
    return new Response(JSON.stringify({ ok: false, error: "Not configured" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }
  const header =
    request.headers.get("x-cron-secret") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (header !== expected) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return null;
}
