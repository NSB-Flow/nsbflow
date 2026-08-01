import { syncRecordToCrmFn } from "@/lib/crm.functions";

/**
 * Fire-and-forget outbound CRM push. Never blocks or breaks the UI flow —
 * the server function is a no-op when the workspace has no active connection.
 */
export function pushToCrm(
  workspaceId: string | null | undefined,
  object: "company" | "opportunity",
  recordId: string | null | undefined,
) {
  if (!workspaceId || !recordId) return;
  void syncRecordToCrmFn({ data: { workspaceId, object, recordId } }).catch(() => void 0);
}
