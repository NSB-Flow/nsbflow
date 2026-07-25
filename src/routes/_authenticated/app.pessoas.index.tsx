import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus, Users, Network, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { ROLE_LABELS, type AppRole } from "@/lib/roles";

const COORD_OR_ABOVE: AppRole[] = [
  "super_admin", "admin", "admin_empresa", "ceo", "diretor", "gerente", "coordenador",
];

export const Route = createFileRoute("/_authenticated/app/pessoas/")({
  head: () => ({
    meta: [
      { title: "Pessoas — NSB Flow" },
      { name: "description", content: "Equipe de vendedores: carteira, KPIs e organograma." },
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

  // 1) IDs visíveis: eu + subordinados retornados pela função hierárquica
  const { data: visibleIds = [] } = useQuery({
    queryKey: ["pessoas-visible-ids", workspaceId, user?.id],
    enabled: !!workspaceId && !!user,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc("get_subordinates", {
        p_manager_id: user!.id,
        p_workspace_id: workspaceId!,
      });
      if (error) throw error;
      const subs = ((data ?? []) as Array<{ get_subordinates?: string } | string>).map((r) =>
        typeof r === "string" ? r : (r.get_subordinates ?? ""),
      ).filter(Boolean);
      return Array.from(new Set([user!.id, ...subs]));
    },
    staleTime: 30_000,
  });

  const { data: members = [] } = useQuery({
    queryKey: ["pessoas-members", workspaceId, visibleIds],
    enabled: !!workspaceId && visibleIds.length > 0,
    queryFn: async (): Promise<Member[]> => {
      const { data: wm } = await supabase
        .from("workspace_members")
        .select("user_id, role")
        .eq("workspace_id", workspaceId!)
        .eq("active", true)
        .in("user_id", visibleIds);
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

  // KPIs por membro (contas, reuniões, nota média)
  const { data: kpis = {} } = useQuery({
    queryKey: ["pessoas-kpis", workspaceId, visibleIds],
    enabled: !!workspaceId && visibleIds.length > 0,
    queryFn: async (): Promise<Record<string, { carteira: number; reunioes: number; nota: number | null }>> => {
      const [aa, runs, ma] = await Promise.all([
        supabase
          .from("account_assignments")
          .select("user_id")
          .eq("workspace_id", workspaceId!)
          .eq("role_in_account", "vendedor_principal")
          .in("user_id", visibleIds),
        supabase
          .from("agent_runs")
          .select("created_by, status")
          .eq("workspace_id", workspaceId!)
          .eq("status", "done")
          .in("created_by", visibleIds),
        supabase
          .from("meeting_analyses")
          .select("meeting_score, agent_run_id, agent_runs!inner(created_by, workspace_id, agent)")
          .eq("workspace_id", workspaceId!)
          .eq("agent_runs.agent", "deap_intelligence")
          .in("agent_runs.created_by", visibleIds),
      ]);

      const acc: Record<string, { carteira: number; reunioes: number; sum: number; n: number }> = {};
      for (const id of visibleIds) acc[id] = { carteira: 0, reunioes: 0, sum: 0, n: 0 };
      for (const row of aa.data ?? []) {
        if (row.user_id && acc[row.user_id]) acc[row.user_id].carteira++;
      }
      for (const row of runs.data ?? []) {
        if (row.created_by && acc[row.created_by]) acc[row.created_by].reunioes++;
      }
      for (const row of (ma.data ?? []) as Array<{
        meeting_score: number | null;
        agent_runs: { created_by: string } | { created_by: string }[] | null;
      }>) {
        const ar = Array.isArray(row.agent_runs) ? row.agent_runs[0] : row.agent_runs;
        const uid = ar?.created_by;
        if (uid && acc[uid] && row.meeting_score != null) {
          acc[uid].sum += Number(row.meeting_score);
          acc[uid].n++;
        }
      }
      const out: Record<string, { carteira: number; reunioes: number; nota: number | null }> = {};
      for (const [id, v] of Object.entries(acc)) {
        out[id] = {
          carteira: v.carteira,
          reunioes: v.reunioes,
          nota: v.n > 0 ? v.sum / v.n : null,
        };
      }
      return out;
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

  // Caso especial: apenas eu mesmo — atalho para meu próprio perfil.
  const onlySelf = members.length === 1 && members[0]?.id === user?.id;

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <Network className="h-7 w-7 text-primary" /> Pessoas
        </h1>
        <p className="text-muted-foreground mt-1">
          Equipe visível para você: você mesmo e seus subordinados na cadeia de report.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> {onlySelf ? "Meu perfil" : "Equipe"}
          </CardTitle>
          <CardDescription>
            {members.length} pessoa(s) visível(is). Clique para abrir a página detalhada.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead className="text-right">Carteira</TableHead>
                <TableHead className="text-right">Reuniões</TableHead>
                <TableHead className="text-right">Nota média</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                    Sem dados ainda.
                  </TableCell>
                </TableRow>
              ) : (
                members.map((m) => {
                  const k = kpis[m.id];
                  return (
                    <TableRow key={m.id} className="cursor-pointer" onClick={() => setSelected(m.id)}>
                      <TableCell>
                        <Link
                          to="/app/pessoas/$id"
                          params={{ id: m.id }}
                          className="font-medium hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {m.name}
                        </Link>
                        {m.id === user?.id && (
                          <Badge variant="outline" className="ml-2 text-[10px]">você</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {ROLE_LABELS[m.role]}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{k?.carteira ?? 0}</TableCell>
                      <TableCell className="text-right tabular-nums">{k?.reunioes ?? 0}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {k?.nota != null ? k.nota.toFixed(1) : "—"}
                      </TableCell>
                      <TableCell>
                        <Link
                          to="/app/pessoas/$id"
                          params={{ id: m.id }}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Abrir"
                        >
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canManage && selectedMember && (
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
                      <button
                        onClick={() => removeManager(r.id)}
                        className="ml-1 rounded-sm hover:text-destructive"
                        aria-label="Remover"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}

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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
