import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { AppRole } from "@/lib/roles";

const COORD_OR_ABOVE: AppRole[] = [
  "super_admin", "admin", "admin_empresa", "ceo", "diretor", "gerente", "coordenador",
];

const ROLE_OPTIONS = [
  { value: "vendedor_principal", label: "Vendedor principal" },
  { value: "sdr", label: "SDR" },
  { value: "consultor", label: "Consultor" },
  { value: "colaborador", label: "Colaborador" },
];

interface Props {
  companyId: string;
  companyWorkspaceId: string;
}

export function AccountAssignments({ companyId, companyWorkspaceId }: Props) {
  const { user, roles } = useAuth();
  const { role } = useWorkspace();
  const qc = useQueryClient();
  const [selUser, setSelUser] = useState<string>("");
  const [selRole, setSelRole] = useState<string>("vendedor_principal");

  const canManage =
    (role && COORD_OR_ABOVE.includes(role)) || roles.includes("super_admin");

  const { data: assignments = [] } = useQuery({
    queryKey: ["account-assignments", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_assignments")
        .select("id, user_id, role_in_account, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["ws-members-for-assign", companyWorkspaceId],
    enabled: !!companyWorkspaceId && canManage,
    queryFn: async () => {
      const { data: wm } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", companyWorkspaceId)
        .eq("active", true);
      const ids = (wm ?? []).map((m) => m.user_id);
      if (ids.length === 0) return [] as { id: string; name: string }[];
      const { data: p } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      return (p ?? []).map((r) => ({ id: r.id, name: r.full_name ?? "Usuário" }));
    },
    staleTime: 60_000,
  });

  const userIds = useMemo(() => assignments.map((a) => a.user_id), [assignments]);
  const { data: nameById = new Map<string, string>() } = useQuery({
    queryKey: ["assignment-names", companyId, userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
      const m = new Map<string, string>();
      (data ?? []).forEach((p) => m.set(p.id, p.full_name ?? "Usuário"));
      return m;
    },
  });

  const add = async () => {
    if (!user || !selUser) return;
    const { error } = await supabase.from("account_assignments").insert({
      company_id: companyId,
      user_id: selUser,
      role_in_account: selRole,
      assigned_by: user.id,
      workspace_id: companyWorkspaceId,
    });
    if (error) return toast.error(error.message);
    toast.success("Pessoa atribuída à conta");
    setSelUser("");
    qc.invalidateQueries({ queryKey: ["account-assignments", companyId] });
    qc.invalidateQueries({ queryKey: ["empresa", companyId] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("account_assignments").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["account-assignments", companyId] });
    qc.invalidateQueries({ queryKey: ["empresa", companyId] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <UserPlus className="h-4 w-4" /> Pessoas atribuídas à conta
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma atribuição.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {assignments.map((a) => (
              <Badge key={a.id} variant="secondary" className="gap-1.5 py-1.5 pl-2.5">
                <span className="font-medium">{nameById.get(a.user_id) ?? "Usuário"}</span>
                <span className="text-muted-foreground text-xs">
                  · {ROLE_OPTIONS.find((r) => r.value === a.role_in_account)?.label ?? a.role_in_account}
                </span>
                {canManage && (
                  <button
                    onClick={() => remove(a.id)}
                    className="ml-1 rounded-sm hover:text-destructive"
                    aria-label="Remover"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </Badge>
            ))}
          </div>
        )}

        {canManage && (
          <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-border/60">
            <div className="min-w-[200px] flex-1">
              <Select value={selUser} onValueChange={setSelUser}>
                <SelectTrigger><SelectValue placeholder="Selecione a pessoa" /></SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[180px]">
              <Select value={selRole} onValueChange={setSelRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={add} disabled={!selUser}>
              <Plus className="h-4 w-4 mr-1.5" /> Atribuir
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
