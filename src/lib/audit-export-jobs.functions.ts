import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ExportJobStatus = "queued" | "processing" | "completed" | "failed" | "canceled";

export type ExportJobFilters = {
  search: string;
  action: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  fromDate?: string;
  toDate?: string;
};

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
  filters: ExportJobFilters;
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

type RawRow = {
  id: string;
  kind: string;
  status: string;
  total_rows: number | null;
  processed_rows: number | null;
  file_path: string | null;
  file_size_bytes: number | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  workspace_id: string | null;
  filters: ExportJobFilters | null;
};

function toJob(row: RawRow): ExportJob {
  return {
    id: row.id,
    kind: row.kind as ExportJob["kind"],
    status: row.status as ExportJobStatus,
    totalRows: row.total_rows,
    processedRows: row.processed_rows,
    filePath: row.file_path,
    fileSizeBytes: row.file_size_bytes,
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    workspaceId: row.workspace_id,
    filters:
      row.filters ?? {
        search: "",
        action: "all",
        sortBy: "created_at",
        sortDir: "desc",
      },
  };
}

// The generated Database types do not yet include the new `export_jobs` table.
// Use light `any` casts on the query builders until types regen.
/* eslint-disable @typescript-eslint/no-explicit-any */

export const enqueueAuditExportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => enqueueSchema.parse(raw))
  .handler(async ({ data, context }): Promise<ExportJob> => {
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
    const admin = supabaseAdmin as any;
    const { data: inserted, error: insErr } = await admin
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

    const base = process.env.PUBLIC_APP_URL || "https://nsbflow.lovable.app";
    void fetch(`${base}/api/public/hooks/process-export-jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId: (inserted as { id: string }).id }),
    }).catch(() => undefined);

    return toJob(inserted as RawRow);
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
    let q = (context.supabase as any)
      .from("export_jobs")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.kind) q = q.eq("kind", data.kind);
    if (data.workspaceId) q = q.eq("workspace_id", data.workspaceId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return ((rows ?? []) as RawRow[]).map(toJob);
  });

const downloadSchema = z.object({ jobId: z.string().uuid() });

export const getExportDownloadUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => downloadSchema.parse(raw))
  .handler(async ({ data, context }): Promise<{ url: string; filename: string }> => {
    const { data: job, error } = await (context.supabase as any)
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
      .createSignedUrl(job.file_path as string, 300);
    if (sErr || !signed) throw new Error(sErr?.message ?? "Failed to sign URL");

    const stamp = new Date(job.created_at as string).toISOString().slice(0, 10);
    const label = job.kind === "role_audit" ? "role-audit" : "workspace-audit";
    return { url: signed.signedUrl, filename: `nsb-flow-${label}-${stamp}.csv` };
  });

const cancelSchema = z.object({ jobId: z.string().uuid() });

export const cancelAuditExportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => cancelSchema.parse(raw))
  .handler(async ({ data, context }): Promise<ExportJob> => {
    // Ownership check under RLS-scoped client
    const { data: job, error } = await (context.supabase as any)
      .from("export_jobs")
      .select("id, user_id, status")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Job não encontrado");
    if (job.user_id !== context.userId) throw new Error("Forbidden");
    if (job.status !== "queued" && job.status !== "processing") {
      throw new Error("Este job já foi finalizado e não pode ser cancelado.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error: uErr } = await (supabaseAdmin as any)
      .from("export_jobs")
      .update({
        status: "canceled",
        completed_at: new Date().toISOString(),
        error: "Cancelado pelo usuário",
      })
      .eq("id", data.jobId)
      .in("status", ["queued", "processing"])
      .select()
      .single();
    if (uErr || !updated) throw new Error(uErr?.message ?? "Falha ao cancelar");
    return toJob(updated as RawRow);
  });

