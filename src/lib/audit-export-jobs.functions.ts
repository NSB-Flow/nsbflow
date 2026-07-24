import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ExportJobStatus = "queued" | "processing" | "completed" | "failed" | "canceled";

export type ExportJob = {
  id: string;
  kind: "role_audit" | "workspace_member_audit";
  status: ExportJobStatus;
  totalRows: number | null;
  processedRows: number | null;
  filePath: string | null;
  fileSizeBytes: number | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  workspaceId: string | null;
  filters: Record<string, unknown>;
};

const filtersSchema = z.object({
  search: z.string().default(""),
  action: z.string().default("all"),
  sortBy: z.string().default("created_at"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
});

const enqueueSchema = z.object({
  kind: z.enum(["role_audit", "workspace_member_audit"]),
  workspaceId: z.string().uuid().optional(),
  filters: filtersSchema,
});

function toJob(row: Record<string, unknown>): ExportJob {
  return {
    id: row.id as string,
    kind: row.kind as ExportJob["kind"],
    status: row.status as ExportJobStatus,
    totalRows: (row.total_rows as number | null) ?? null,
    processedRows: (row.processed_rows as number | null) ?? null,
    filePath: (row.file_path as string | null) ?? null,
    fileSizeBytes: (row.file_size_bytes as number | null) ?? null,
    error: (row.error as string | null) ?? null,
    createdAt: row.created_at as string,
    startedAt: (row.started_at as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    workspaceId: (row.workspace_id as string | null) ?? null,
    filters: (row.filters as Record<string, unknown>) ?? {},
  };
}

/** Enqueue an async export job. Best-effort triggers processing immediately; pg_cron is a fallback. */
export const enqueueAuditExportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => enqueueSchema.parse(raw))
  .handler(async ({ data, context }): Promise<ExportJob> => {
    // Authorization mirrors the sync audit endpoints
    if (data.kind === "role_audit") {
      const { data: isSuper } = await context.supabase.rpc("is_super_admin", {
        _user_id: context.userId,
      });
      if (!isSuper) throw new Error("Forbidden: super admin only");
    } else {
      if (!data.workspaceId) throw new Error("workspaceId is required");
      const { data: member, error } = await context.supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", data.workspaceId)
        .eq("user_id", context.userId)
        .eq("active", true)
        .maybeSingle();
      const { data: isSuper } = await context.supabase.rpc("is_super_admin", {
        _user_id: context.userId,
      });
      const allowed = ["super_admin", "admin", "admin_empresa", "ceo", "diretor"];
      if (error) throw new Error(error.message);
      if (!isSuper && !(member && allowed.includes(member.role as string))) {
        throw new Error("Forbidden: workspace admin only");
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("export_jobs")
      .insert({
        user_id: context.userId,
        workspace_id: data.workspaceId ?? null,
        kind: data.kind,
        format: "csv",
        filters: data.filters,
        status: "queued",
      })
      .select()
      .single();
    if (insErr || !inserted) throw new Error(insErr?.message ?? "Failed to enqueue job");

    // Best-effort kick — pg_cron will pick it up within a minute if this fails.
    const base = process.env.PUBLIC_APP_URL || "https://nsbflow.lovable.app";
    void fetch(`${base}/api/public/hooks/process-export-jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId: (inserted as { id: string }).id }),
    }).catch(() => undefined);

    return toJob(inserted as Record<string, unknown>);
  });

const listSchema = z.object({
  kind: z.enum(["role_audit", "workspace_member_audit"]).optional(),
  workspaceId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(10),
});

export const listAuditExportJobsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => listSchema.parse(raw ?? {}))
  .handler(async ({ data, context }): Promise<ExportJob[]> => {
    let q = context.supabase
      .from("export_jobs")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.kind) q = q.eq("kind", data.kind);
    if (data.workspaceId) q = q.eq("workspace_id", data.workspaceId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => toJob(r as Record<string, unknown>));
  });

const downloadSchema = z.object({ jobId: z.string().uuid() });

export const getExportDownloadUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => downloadSchema.parse(raw))
  .handler(async ({ data, context }): Promise<{ url: string; filename: string }> => {
    const { data: job, error } = await context.supabase
      .from("export_jobs")
      .select("id, user_id, status, file_path, kind, created_at")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Job not found");
    if (job.user_id !== context.userId) throw new Error("Forbidden");
    if (job.status !== "completed" || !job.file_path) throw new Error("Job is not ready");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("audit-exports")
      .createSignedUrl(job.file_path, 300);
    if (sErr || !signed) throw new Error(sErr?.message ?? "Failed to sign URL");

    const stamp = new Date(job.created_at as string).toISOString().slice(0, 10);
    const label = job.kind === "role_audit" ? "role-audit" : "workspace-audit";
    return { url: signed.signedUrl, filename: `nsb-flow-${label}-${stamp}.csv` };
  });
