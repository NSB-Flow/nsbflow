import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import type { AppRole } from "@/lib/roles";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  is_personal: boolean;
  logo_url: string | null;
}

interface WorkspaceCtx {
  workspaceId: string | null;
  workspace: Workspace | null;
  workspaces: Workspace[];
  role: AppRole | null;
  loading: boolean;
  switchWorkspace: (id: string) => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<WorkspaceCtx | undefined>(undefined);
const STORAGE_KEY = "nsb.activeWorkspaceId";

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, roles } = useAuth();
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: memberships = [], isLoading, refetch } = useQuery({
    queryKey: ["my-workspaces", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("workspace_members")
        .select("role, workspaces(id, name, slug, is_personal, logo_url)")
        .eq("user_id", user.id)
        .eq("active", true);
      return (data ?? [])
        .map((m) => {
          const w = Array.isArray(m.workspaces) ? m.workspaces[0] : m.workspaces;
          return w ? { ...(w as Workspace), role: m.role as AppRole } : null;
        })
        .filter((x): x is Workspace & { role: AppRole } => !!x);
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (memberships.length === 0) return;
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const valid = memberships.find((w) => w.id === stored);
    setActiveId((valid ?? memberships[0]).id);
  }, [memberships]);

  const switchWorkspace = useCallback(
    (id: string) => {
      setActiveId(id);
      if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
      qc.clear();
    },
    [qc],
  );

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const current = memberships.find((w) => w.id === activeId) ?? null;

  return (
    <Ctx.Provider
      value={{
        workspaceId: activeId,
        workspace: current,
        workspaces: memberships,
        role: (current?.role as AppRole) ?? roles[0] ?? null,
        loading: isLoading,
        switchWorkspace,
        refresh,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useWorkspace() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace must be inside WorkspaceProvider");
  return v;
}
