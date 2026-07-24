/**
 * Async audit export processor. Runs only on the server: iterates queued jobs,
 * streams matching rows, uploads a CSV to the private `audit-exports` bucket,
 * updates status and drops a notification for the requesting user.
 *
 * SECURITY: bypasses RLS via the service role. Never import from client code —
 * only the `/api/public/hooks/process-export-jobs` route and pg_cron hit this.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BATCH_SIZE = 1000;
const HARD_CAP_ROWS = 100_000;
const MAX_JOBS_PER_INVOCATION = 3;

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CANCELED_SENTINEL = "__EXPORT_CANCELED__";

async function assertNotCanceled(jobId: string): Promise<void> {
  const { data } = await (supabaseAdmin as any)
    .from("export_jobs")
    .select("status")
    .eq("id", jobId)
    .maybeSingle();
  if (data?.status === "canceled") throw new Error(CANCELED_SENTINEL);
}

type Filters = {
  search?: string;
  action?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  fromDate?: string;
  toDate?: string;
};

type JobRow = {
  id: string;
  user_id: string;
  workspace_id: string | null;
  kind: "role_audit" | "workspace_member_audit";
  filters: Filters | null;
};

async function resolveEmails(ids: string[]): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  if (ids.length === 0) return emails;
  const unique = Array.from(new Set(ids));
  // Fetch in a single page; audit rows we surface won't exceed the auth user list.
  const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of list.data?.users ?? []) {
    if (unique.includes(u.id)) emails.set(u.id, u.email ?? u.id);
  }
  return emails;
}

async function buildRoleAuditCsv(job: JobRow): Promise<{ csv: string; total: number }> {
  const f = job.filters ?? {};
  const header = [
    "Quando",
    "Acao",
    "Perfil",
    "Usuario alvo (id)",
    "Usuario alvo (email)",
    "Executado por (id)",
    "Executado por (email)",
    "IP",
    "Navegador",
  ];
  const lines: string[] = [header.join(",")];
  let total = 0;
  let offset = 0;

  while (offset < HARD_CAP_ROWS) {
    let q = supabaseAdmin
      .from("user_role_audit")
      .select("id, created_at, action, role, target_user_id, actor_user_id, ip, user_agent")
      .order(f.sortBy || "created_at", { ascending: f.sortDir === "asc" })
      .range(offset, offset + BATCH_SIZE - 1);
    if (f.action && f.action !== "all") q = q.eq("action", f.action);
    if (f.fromDate) q = q.gte("created_at", f.fromDate);
    if (f.toDate) q = q.lte("created_at", f.toDate);
    const term = (f.search ?? "").trim();
    if (term) {
      const like = `%${term}%`;
      q = q.or(`role.ilike.${like},ip.ilike.${like},user_agent.ilike.${like}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) break;

    const ids: string[] = [];
    for (const r of rows) {
      if (r.target_user_id) ids.push(r.target_user_id);
      if (r.actor_user_id) ids.push(r.actor_user_id);
    }
    const emails = await resolveEmails(ids);
    for (const r of rows) {
      lines.push(
        [
          new Date(r.created_at as string).toISOString(),
          r.action,
          r.role,
          r.target_user_id ?? "",
          emails.get(r.target_user_id as string) ?? "",
          r.actor_user_id ?? "",
          r.actor_user_id ? emails.get(r.actor_user_id as string) ?? "" : "",
          (r as { ip: string | null }).ip ?? "",
          (r as { user_agent: string | null }).user_agent ?? "",
        ]
          .map(csvEscape)
          .join(","),
      );
    }
    total += rows.length;
    offset += rows.length;
    // Mark progress
    await (supabaseAdmin as any).from("export_jobs")
      .update({ processed_rows: total })
      .eq("id", job.id);
    await assertNotCanceled(job.id);

    if (rows.length < BATCH_SIZE) break;
  }
  return { csv: "\uFEFF" + lines.join("\n"), total };
}

async function buildWorkspaceAuditCsv(job: JobRow): Promise<{ csv: string; total: number }> {
  if (!job.workspace_id) throw new Error("Missing workspace_id");
  const f = job.filters ?? {};
  const header = [
    "Quando",
    "Acao",
    "Papel anterior",
    "Papel novo",
    "Ativo anterior",
    "Ativo novo",
    "Usuario alvo (id)",
    "Usuario alvo (email)",
    "Executado por (id)",
    "Executado por (email)",
    "IP",
    "Navegador",
  ];
  const lines: string[] = [header.join(",")];
  let total = 0;
  let offset = 0;

  while (offset < HARD_CAP_ROWS) {
    let q = supabaseAdmin
      .from("workspace_member_audit")
      .select(
        "id, created_at, workspace_id, action, old_role, new_role, old_active, new_active, target_user_id, actor_user_id, ip, user_agent",
      )
      .eq("workspace_id", job.workspace_id)
      .order(f.sortBy || "created_at", { ascending: f.sortDir === "asc" })
      .range(offset, offset + BATCH_SIZE - 1);
    if (f.action && f.action !== "all") q = q.eq("action", f.action);
    if (f.fromDate) q = q.gte("created_at", f.fromDate);
    if (f.toDate) q = q.lte("created_at", f.toDate);
    const term = (f.search ?? "").trim();
    if (term) {
      const like = `%${term}%`;
      q = q.or(
        `old_role.ilike.${like},new_role.ilike.${like},ip.ilike.${like},user_agent.ilike.${like}`,
      );
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) break;

    const ids: string[] = [];
    for (const r of rows) {
      if (r.target_user_id) ids.push(r.target_user_id);
      if (r.actor_user_id) ids.push(r.actor_user_id);
    }
    const emails = await resolveEmails(ids);
    for (const r of rows) {
      lines.push(
        [
          new Date(r.created_at as string).toISOString(),
          r.action,
          r.old_role ?? "",
          r.new_role ?? "",
          r.old_active == null ? "" : String(r.old_active),
          r.new_active == null ? "" : String(r.new_active),
          r.target_user_id ?? "",
          emails.get(r.target_user_id as string) ?? "",
          r.actor_user_id ?? "",
          r.actor_user_id ? emails.get(r.actor_user_id as string) ?? "" : "",
          r.ip ?? "",
          r.user_agent ?? "",
        ]
          .map(csvEscape)
          .join(","),
      );
    }
    total += rows.length;
    offset += rows.length;
    await (supabaseAdmin as any).from("export_jobs")
      .update({ processed_rows: total })
      .eq("id", job.id);
    await assertNotCanceled(job.id);

    if (rows.length < BATCH_SIZE) break;
  }
  return { csv: "\uFEFF" + lines.join("\n"), total };
}

async function processJob(job: JobRow): Promise<void> {
  const started = await (supabaseAdmin as any).from("export_jobs")
    .update({ status: "processing", started_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();
  // Another worker grabbed it first
  if (!started.data) return;

  try {
    const { csv, total } =
      job.kind === "role_audit"
        ? await buildRoleAuditCsv(job)
        : await buildWorkspaceAuditCsv(job);

    const path = `${job.user_id}/${job.id}.csv`;
    const bytes = new TextEncoder().encode(csv);
    const { error: upErr } = await supabaseAdmin.storage
      .from("audit-exports")
      .upload(path, bytes, {
        contentType: "text/csv; charset=utf-8",
        upsert: true,
      });
    if (upErr) throw new Error(upErr.message);

    await assertNotCanceled(job.id);
    const { data: doneRow } = await (supabaseAdmin as any).from("export_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        total_rows: total,
        processed_rows: total,
        file_path: path,
        file_size_bytes: bytes.byteLength,
      })
      .eq("id", job.id)
      .eq("status", "processing")
      .select("id")
      .maybeSingle();
    if (!doneRow) return; // Was canceled at the last moment

    const label = job.kind === "role_audit" ? "Auditoria de Perfis" : "Auditoria de Workspace";
    await supabaseAdmin.from("user_notifications").upsert(
      {
        user_id: job.user_id,
        workspace_id: job.workspace_id,
        kind: "export_ready",
        severity: "info",
        title: `Exportação pronta: ${label}`,
        body: `${total.toLocaleString("pt-BR")} registro(s) — clique para baixar.`,
        action_url: `/app/exports/${job.id}`,
        dedupe_key: `export_ready:${job.id}`,
      },
      { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === CANCELED_SENTINEL) {
      // Status was already set to 'canceled' by the user; leave it and drop a notification.
      await supabaseAdmin.from("user_notifications").upsert(
        {
          user_id: job.user_id,
          workspace_id: job.workspace_id,
          kind: "export_failed",
          severity: "info",
          title: "Exportação cancelada",
          body: "Você cancelou esta exportação antes da conclusão.",
          action_url: null,
          dedupe_key: `export_canceled:${job.id}`,
        },
        { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
      );
      return;
    }
    await (supabaseAdmin as any).from("export_jobs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error: msg.slice(0, 500),
      })
      .eq("id", job.id);
    await supabaseAdmin.from("user_notifications").upsert(
      {
        user_id: job.user_id,
        workspace_id: job.workspace_id,
        kind: "export_failed",
        severity: "warning",
        title: "Falha na exportação",
        body: msg.slice(0, 300),
        action_url: null,
        dedupe_key: `export_failed:${job.id}`,
      },
      { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
    );
  }
}

/** Process one specific job (called immediately after enqueue) or up to N queued jobs. */
export async function processExportJobs(specificJobId?: string): Promise<{ processed: number }> {
  if (specificJobId) {
    const { data: job } = await (supabaseAdmin as any).from("export_jobs")
      .select("id, user_id, workspace_id, kind, filters, status")
      .eq("id", specificJobId)
      .maybeSingle();
    if (!job || job.status !== "queued") return { processed: 0 };
    await processJob(job as JobRow);
    return { processed: 1 };
  }
  // Recover stale queued jobs (older than 10 seconds) that lost their trigger.
  const cutoff = new Date(Date.now() - 10_000).toISOString();
  const { data: jobs } = await (supabaseAdmin as any).from("export_jobs")
    .select("id, user_id, workspace_id, kind, filters")
    .eq("status", "queued")
    .lte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(MAX_JOBS_PER_INVOCATION);
  let processed = 0;
  for (const j of jobs ?? []) {
    await processJob(j as JobRow);
    processed += 1;
  }
  return { processed };
}
