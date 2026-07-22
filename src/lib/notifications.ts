import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export type NotificationSeverity = "info" | "warning" | "critical";

export interface AppNotification {
  id: string;
  user_id: string;
  workspace_id: string | null;
  kind: string;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  action_url: string | null;
  dedupe_key: string;
  read_at: string | null;
  created_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from("user_notifications");

export interface RecordInput {
  userId: string;
  kind: string;
  severity: NotificationSeverity;
  title: string;
  body?: string;
  dedupeKey: string;
  workspaceId?: string | null;
  actionUrl?: string | null;
}

/** Insere notificação, ignorando duplicatas (mesmo dedupe_key). Retorna a linha se criada. */
export async function recordNotification(input: RecordInput): Promise<AppNotification | null> {
  const { data, error } = await table()
    .upsert(
      {
        user_id: input.userId,
        kind: input.kind,
        severity: input.severity,
        title: input.title,
        body: input.body ?? null,
        action_url: input.actionUrl ?? null,
        dedupe_key: input.dedupeKey,
        workspace_id: input.workspaceId ?? null,
      },
      { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
    )
    .select()
    .maybeSingle();
  if (error) {
    console.warn("recordNotification error", error.message);
    return null;
  }
  return (data as AppNotification | null) ?? null;
}

export function useNotifications(limit = 20) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user-notifications", user?.id, limit],
    enabled: !!user,
    queryFn: async (): Promise<AppNotification[]> => {
      const { data, error } = await table()
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data as AppNotification[]) ?? [];
    },
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}

export function useMarkNotification() {
  const qc = useQueryClient();
  return {
    markRead: async (id: string) => {
      await table().update({ read_at: new Date().toISOString() }).eq("id", id);
      qc.invalidateQueries({ queryKey: ["user-notifications"] });
    },
    markAllRead: async () => {
      await table().update({ read_at: new Date().toISOString() }).is("read_at", null);
      qc.invalidateQueries({ queryKey: ["user-notifications"] });
    },
    remove: async (id: string) => {
      await table().delete().eq("id", id);
      qc.invalidateQueries({ queryKey: ["user-notifications"] });
    },
  };
}
