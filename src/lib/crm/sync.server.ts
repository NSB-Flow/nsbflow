/**
 * Bidirectional Salesforce sync (server-only).
 * Outbound is triggered by the application layer after a save.
 * Inbound runs on a 15-minute schedule (pg_cron -> /api/public/hooks/crm-sync).
 */
import {
  CRM_OBJECT_FOR,
  DEFAULT_MAPPINGS,
  STAGE_TO_STATUS,
  STATUS_TO_STAGE,
  nsbFieldType,
  type NsbObject,
} from "./mappings";
import {
  createSfRecord,
  getSfRecord,
  loadConnection,
  markConnectionError,
  soql,
  updateSfRecord,
  type CrmConnection,
} from "./salesforce.server";

type SyncStatus = "success" | "error" | "conflict_resolved";

interface MappingRow {
  nsb_object: string;
  nsb_field: string;
  crm_object: string;
  crm_field: string;
  sync_direction: string;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function log(entry: {
  workspace_id: string;
  direction: "to_crm" | "from_crm";
  nsb_object: string;
  nsb_record_id?: string | null;
  crm_record_id?: string | null;
  status: SyncStatus;
  detail?: string | null;
}) {
  const db = await admin();
  await db.from("crm_sync_log").insert({
    workspace_id: entry.workspace_id,
    direction: entry.direction,
    nsb_object: entry.nsb_object,
    nsb_record_id: entry.nsb_record_id ?? null,
    crm_record_id: entry.crm_record_id ?? null,
    status: entry.status,
    detail: entry.detail?.slice(0, 1000) ?? null,
  });
}

export async function seedDefaultMappings(workspaceId: string) {
  const db = await admin();
  await db.from("crm_field_mappings").upsert(
    DEFAULT_MAPPINGS.map((m) => ({ ...m, workspace_id: workspaceId, provider: "salesforce" })),
    { onConflict: "workspace_id,provider,nsb_object,nsb_field", ignoreDuplicates: true },
  );
}

async function loadMappings(workspaceId: string, object: NsbObject): Promise<MappingRow[]> {
  const db = await admin();
  const { data } = await db
    .from("crm_field_mappings")
    .select("nsb_object, nsb_field, crm_object, crm_field, sync_direction")
    .eq("workspace_id", workspaceId)
    .eq("provider", "salesforce")
    .eq("nsb_object", object);
  return (data ?? []) as MappingRow[];
}

function toCrmValue(object: NsbObject, field: string, value: unknown) {
  if (value === null || value === undefined) return null;
  if (object === "opportunity" && field === "status") {
    return STATUS_TO_STAGE[String(value)] ?? "Prospecting";
  }
  return value;
}

function toNsbValue(object: NsbObject, field: string, value: unknown) {
  if (value === null || value === undefined) return null;
  if (object === "opportunity" && field === "status") {
    return STAGE_TO_STATUS[String(value)] ?? "em_andamento";
  }
  if (nsbFieldType(object, field) === "number") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return typeof value === "string" ? value : String(value);
}

const TABLE_FOR: Record<NsbObject, "companies" | "opportunities"> = {
  company: "companies",
  opportunity: "opportunities",
};

/** Pushes one NSB record to Salesforce. Safe to call fire-and-forget. */
export async function syncRecordOutbound(
  workspaceId: string,
  object: NsbObject,
  recordId: string,
): Promise<{ ok: boolean; skipped?: string; crmId?: string }> {
  const conn = await loadConnection(workspaceId);
  if (!conn || conn.status !== "active" || !conn.instance_url) {
    return { ok: false, skipped: "no_active_connection" };
  }

  const db = await admin();
  const { data: record } = await db
    .from(TABLE_FOR[object])
    .select("*")
    .eq("id", recordId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!record) return { ok: false, skipped: "record_not_found" };

  try {
    const mappings = (await loadMappings(workspaceId, object)).filter(
      (m) => m.sync_direction === "both" || m.sync_direction === "to_crm",
    );
    const row = record as Record<string, unknown>;
    const fields: Record<string, unknown> = {};
    for (const m of mappings) {
      const v = toCrmValue(object, m.nsb_field, row[m.nsb_field]);
      if (v !== null) fields[m.crm_field] = v;
    }

    const crmObject = CRM_OBJECT_FOR[object];
    let crmId = (row["salesforce_id"] as string | null) ?? null;

    if (object === "opportunity") {
      if (!fields["Name"]) fields["Name"] = String(row["title"] ?? "Oportunidade");
      if (!fields["StageName"]) {
        fields["StageName"] = STATUS_TO_STAGE[String(row["status"])] ?? "Prospecting";
      }
      if (!crmId) {
        // Opportunity requires an Account and a CloseDate on creation.
        const accountId = await ensureAccountId(workspaceId, row["company_id"] as string);
        if (!accountId) throw new Error("Conta (Account) do Salesforce não encontrada para a oportunidade");
        fields["AccountId"] = accountId;
        const months = Number(row["contract_months"] ?? 0);
        const close = new Date();
        close.setMonth(close.getMonth() + (Number.isFinite(months) && months > 0 ? months : 1));
        fields["CloseDate"] = close.toISOString().slice(0, 10);
      }
    } else if (!fields["Name"]) {
      fields["Name"] = String(row["razao_social"] ?? "Conta");
    }

    if (crmId) {
      await updateSfRecord(conn, crmObject, crmId, fields);
    } else {
      crmId = await createSfRecord(conn, crmObject, fields);
      await db.from(TABLE_FOR[object]).update({ salesforce_id: crmId }).eq("id", recordId);
    }

    await log({
      workspace_id: workspaceId,
      direction: "to_crm",
      nsb_object: object,
      nsb_record_id: recordId,
      crm_record_id: crmId,
      status: "success",
      detail: `Campos enviados: ${Object.keys(fields).join(", ")}`,
    });
    return { ok: true, crmId: crmId ?? undefined };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await log({
      workspace_id: workspaceId,
      direction: "to_crm",
      nsb_object: object,
      nsb_record_id: recordId,
      status: "error",
      detail: msg,
    });
    return { ok: false, skipped: msg };
  }
}

/** Makes sure the company behind an opportunity exists in Salesforce, returning its Account id. */
async function ensureAccountId(workspaceId: string, companyId: string): Promise<string | null> {
  if (!companyId) return null;
  const db = await admin();
  const { data } = await db
    .from("companies")
    .select("id, salesforce_id")
    .eq("id", companyId)
    .maybeSingle();
  if (!data) return null;
  if (data.salesforce_id) return data.salesforce_id;
  const res = await syncRecordOutbound(workspaceId, "company", companyId);
  return res.crmId ?? null;
}

// ---------------------------------------------------------------- inbound

interface SfAccount {
  Id: string;
  LastModifiedDate: string;
  [k: string]: unknown;
}

function crmFieldsFor(mappings: MappingRow[]) {
  return Array.from(new Set(mappings.map((m) => m.crm_field)));
}

async function pullObject(
  conn: CrmConnection,
  object: NsbObject,
  since: string,
): Promise<{ applied: number; conflicts: number; created: number; errors: number }> {
  const workspaceId = conn.workspace_id;
  const stats = { applied: 0, conflicts: 0, created: 0, errors: 0 };
  const mappings = (await loadMappings(workspaceId, object)).filter(
    (m) => m.sync_direction === "both" || m.sync_direction === "from_crm",
  );
  if (mappings.length === 0) return stats;

  const crmObject = CRM_OBJECT_FOR[object];
  const selectFields = ["Id", "LastModifiedDate", ...crmFieldsFor(mappings)];
  if (object === "opportunity") selectFields.push("AccountId");
  const query =
    `SELECT ${Array.from(new Set(selectFields)).join(", ")} FROM ${crmObject} ` +
    `WHERE LastModifiedDate > ${new Date(since).toISOString()} ORDER BY LastModifiedDate ASC LIMIT 200`;

  const records = await soql<SfAccount>(conn, query);
  const db = await admin();

  for (const rec of records) {
    try {
      const patch: Record<string, unknown> = {};
      for (const m of mappings) {
        const v = toNsbValue(object, m.nsb_field, rec[m.crm_field]);
        if (v !== null) patch[m.nsb_field] = v;
      }

      const { data: existing } = await db
        .from(TABLE_FOR[object])
        .select("id, updated_at")
        .eq("workspace_id", workspaceId)
        .eq("salesforce_id", rec.Id)
        .maybeSingle();

      if (existing) {
        const nsbUpdated = new Date(existing.updated_at as string).getTime();
        const crmUpdated = new Date(rec.LastModifiedDate).getTime();
        const nsbTouchedSince = nsbUpdated > new Date(since).getTime();

        if (nsbTouchedSince && nsbUpdated > crmUpdated) {
          // Both sides changed; NSB is newer -> last-write-wins pushes NSB to the CRM.
          await syncRecordOutbound(workspaceId, object, existing.id as string);
          await log({
            workspace_id: workspaceId,
            direction: "from_crm",
            nsb_object: object,
            nsb_record_id: existing.id as string,
            crm_record_id: rec.Id,
            status: "conflict_resolved",
            detail: "Conflito resolvido: versão do NSB Flow é mais recente e venceu (last-write-wins).",
          });
          stats.conflicts++;
          continue;
        }

        const { error } = await db
          .from(TABLE_FOR[object])
          .update(patch as never)
          .eq("id", existing.id as string);
        if (error) throw new Error(error.message);
        await log({
          workspace_id: workspaceId,
          direction: "from_crm",
          nsb_object: object,
          nsb_record_id: existing.id as string,
          crm_record_id: rec.Id,
          status: nsbTouchedSince ? "conflict_resolved" : "success",
          detail: nsbTouchedSince
            ? "Conflito resolvido: versão do Salesforce é mais recente e venceu (last-write-wins)."
            : `Campos aplicados: ${Object.keys(patch).join(", ")}`,
        });
        if (nsbTouchedSince) stats.conflicts++;
        else stats.applied++;
        continue;
      }

      // No NSB counterpart yet -> create one.
      if (object === "company") {
        const insert = {
          workspace_id: workspaceId,
          razao_social: String(patch["razao_social"] ?? rec["Name"] ?? "Conta do Salesforce"),
          ...patch,
          salesforce_id: rec.Id,
          created_by: conn.connected_by ?? null,
        };
        const { data: created, error } = await db
          .from("companies")
          .insert(insert as never)
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        await log({
          workspace_id: workspaceId,
          direction: "from_crm",
          nsb_object: object,
          nsb_record_id: created.id,
          crm_record_id: rec.Id,
          status: "success",
          detail: "Empresa criada a partir do Salesforce",
        });
        stats.created++;
      } else {
        const accountId = rec["AccountId"] as string | null;
        const { data: company } = accountId
          ? await db
              .from("companies")
              .select("id")
              .eq("workspace_id", workspaceId)
              .eq("salesforce_id", accountId)
              .maybeSingle()
          : { data: null };
        if (!company) {
          await log({
            workspace_id: workspaceId,
            direction: "from_crm",
            nsb_object: object,
            crm_record_id: rec.Id,
            status: "error",
            detail: "Oportunidade ignorada: conta (Account) correspondente não existe no NSB Flow.",
          });
          stats.errors++;
          continue;
        }
        const insert = {
          workspace_id: workspaceId,
          company_id: company.id,
          title: String(patch["title"] ?? rec["Name"] ?? "Oportunidade do Salesforce"),
          status: String(patch["status"] ?? "aberta"),
          ...patch,
          salesforce_id: rec.Id,
          created_by: conn.connected_by!,
        };
        const { data: created, error } = await db
          .from("opportunities")
          .insert(insert as never)
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        await log({
          workspace_id: workspaceId,
          direction: "from_crm",
          nsb_object: object,
          nsb_record_id: created.id,
          crm_record_id: rec.Id,
          status: "success",
          detail: "Oportunidade criada a partir do Salesforce",
        });
        stats.created++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await log({
        workspace_id: workspaceId,
        direction: "from_crm",
        nsb_object: object,
        crm_record_id: rec.Id,
        status: "error",
        detail: msg,
      });
      stats.errors++;
    }
  }
  return stats;
}

/** Polls Salesforce for one workspace. */
export async function runInboundSyncForWorkspace(workspaceId: string) {
  const conn = await loadConnection(workspaceId);
  if (!conn || conn.status !== "active" || !conn.instance_url) {
    return { ok: false, skipped: "no_active_connection" as const };
  }
  const since = conn.last_sync_at ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const startedAt = new Date().toISOString();
  try {
    const companies = await pullObject(conn, "company", since);
    const opportunities = await pullObject(conn, "opportunity", since);
    const db = await admin();
    await db
      .from("crm_connections")
      .update({ last_sync_at: startedAt, status: "active", last_error: null })
      .eq("id", conn.id);
    return { ok: true, companies, opportunities };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markConnectionError(workspaceId, msg);
    await log({
      workspace_id: workspaceId,
      direction: "from_crm",
      nsb_object: "connection",
      status: "error",
      detail: msg,
    });
    return { ok: false, error: msg };
  }
}

/** Polls Salesforce for every workspace with an active connection (cron entry point). */
export async function runInboundSyncAll() {
  const db = await admin();
  const { data: conns, error } = await db
    .from("crm_connections")
    .select("workspace_id")
    .eq("provider", "salesforce")
    .eq("status", "active");
  if (error) throw new Error(error.message);

  const results: { workspaceId: string; ok: boolean }[] = [];
  for (const c of conns ?? []) {
    const r = await runInboundSyncForWorkspace(c.workspace_id);
    results.push({ workspaceId: c.workspace_id, ok: r.ok });
  }
  return { processed: results.length, results };
}

export async function disconnectCrm(workspaceId: string) {
  const db = await admin();
  const { error } = await db
    .from("crm_connections")
    .update({
      status: "disconnected",
      access_token: null,
      refresh_token: null,
    })
    .eq("workspace_id", workspaceId)
    .eq("provider", "salesforce");
  if (error) throw new Error(error.message);
}

export async function getSfRecordSummary(conn: CrmConnection, object: string, id: string) {
  return getSfRecord(conn, object, id, ["Id", "Name", "LastModifiedDate"]);
}
