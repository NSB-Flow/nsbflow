import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Users, Network } from "lucide-react";
import { toast } from "sonner";
import { ROLE_LABELS, type AppRole } from "@/lib/roles";

const COORD_OR_ABOVE: AppRole[] = [
  "super_admin", "admin", "admin_empresa", "ceo", "diretor", "gerente", "coordenador",
];

export const Route = createFileRoute("/_authenticated/app/pessoas")({
  head: () => ({
    meta: [
      { title: "Pessoas — NSB Flow" },
      { name: "description", content: "Organograma da equipe: defina quem reporta a quem no workspace." },
    ],
  }),
  component: PessoasPage,
});

type Member = { id: string; name: string; role: AppRole };

function PessoasPage() {
  const { user, roles } = useAuth();
  const { workspaceId, role } = useWorkspace();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string>("");
  const [newManager, setNewManager] = useState<string>("");

  const canManage =
    (role && COORD_OR_ABOVE.includes(role)) || roles.includes("super_admin");

  const { data: members = [] } = useQuery({
    queryKey: ["pessoas-members", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<Member[]> => {
      const { data: wm } = await supabase
        .from("workspace_members")
        .select("user_id, role")
        .eq("workspace_id", workspaceId!)
        .eq("active", true);
      const ids = (wm ?? []).map((m) => m.user_id);
      if (ids.length === 0) return [];
      const { data: p } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const nameMap = new Map((p ?? []).map((x) => [x.id, x.full_name ?? "Usuário"]));
      return (wm ?? []).map((m) => ({
        id: m.user_id,
        name: nameMap.get(m.user_id) ?? "Usuário",
        role: m.role as AppRole,
      }));
    },
    staleTime: 30_000,
  });

  const { data: reports = [] } = useQuery({
    queryKey: ["user-reports-to", workspaceId, selected],
    enabled: !!workspaceId && !!selected,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_reports_to")
        .select("id, manager_id")
        .eq("workspace_id", workspaceId!)
        .eq("user_id", selected);
      if (error) throw error;
      return data ?? [];
    },
  });

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const selectedMember = selected ? memberById.get(selected) : null;

  const managerOptions = useMemo(() => {
    const existing = new Set(reports.map((r) => r.manager_id));
    return members.filter((m) => m.id !== selected && !existing.has(m.id));
  }, [members, reports, selected]);

  const addManager = async () => {
    if (!user || !workspaceId || !selected || !newManager) return;
    const { error } = await supabase.from("user_reports_to").insert({
      user_id: selected,
      manager_id: newManager,
      workspace_id: workspaceId,
    });
    if (error) return toast.error(error.message);
    toast.success("Vínculo criado");
    setNewManager("");
    qc.invalidateQueries({ queryKey: ["user-reports-to", workspaceId, selected] });
  };

  const removeManager = async (id: string) => {
    const { error } = await supabase.from("user_reports_to").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["user-reports-to", workspaceId, selected] });
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <Network className="h-7 w-7 text-primary" /> Pessoas
        </h1>
        <p className="text-muted-foreground mt-1">
          Organograma da equipe. Define quem reporta a quem — a visibilidade dos dados segue essa cadeia.
        </p>
      </div>

      {!canManage && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Apenas Coordenador ou acima pode editar o organograma. Você pode visualizar a equipe abaixo.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Equipe do workspace</CardTitle>
          <CardDescription>{members.length} pessoa(s).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelected(m.id)}
                className={`text-left rounded-md border px-3 py-2 text-sm transition ${
                  selected === m.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                }`}
              >
                <div className="font-medium">{m.name}</div>
                <div className="text-xs text-muted-foreground">{ROLE_LABELS[m.role]}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedMember && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Superiores diretos de <span className="text-primary">{selectedMember.name}</span>
            </CardTitle>
            <CardDescription>
              {ROLE_LABELS[selectedMember.role]} · uma pessoa pode ter múltiplos superiores em níveis diferentes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {reports.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum superior definido.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {reports.map((r) => {
                  const mgr = memberById.get(r.manager_id);
                  return (
                    <Badge key={r.id} variant="secondary" className="gap-1.5 py-1.5 pl-2.5">
                      <span className="font-medium">{mgr?.name ?? "Usuário"}</span>
                      {mgr && <span className="text-xs text-muted-foreground">· {ROLE_LABELS[mgr.role]}</span>}
                      {canManage && (
                        <button
                          onClick={() => removeManager(r.id)}
                          className="ml-1 rounded-sm hover:text-destructive"
                          aria-label="Remover"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </Badge>
                  );
                })}
              </div>
            )}

            {canManage && (
              <div className="flex flex-wrap items-end gap-2 pt-3 border-t border-border/60">
                <div className="min-w-[240px] flex-1">
                  <Select value={newManager} onValueChange={setNewManager}>
                    <SelectTrigger><SelectValue placeholder="Adicionar superior" /></SelectTrigger>
                    <SelectContent>
                      {managerOptions.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name} — {ROLE_LABELS[m.role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={addManager} disabled={!newManager}>
                  <Plus className="h-4 w-4 mr-1.5" /> Adicionar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
