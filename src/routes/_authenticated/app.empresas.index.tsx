import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Building2, Plus, Search, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CompanyForm, type CompanyFormValues } from "@/components/companies/CompanyForm";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { isAdminRole, type AppRole } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/app/empresas/")({
  head: () => ({
    meta: [
      { title: "Empresas — NSB Flow" },
      { name: "description", content: "Gestão de contas: cadastro, vendedor responsável, oportunidades e histórico consolidado por empresa." },
    ],
  }),
  component: EmpresasPage,
});

type CompanyRow = {
  id: string;
  razao_social: string;
  cnpj: string | null;
  segment: string | null;
  company_size: string | null;
  assigned_to: string | null;
  created_at: string;
  last_run: string | null;
  open_opportunities: number;
  assigned_name: string | null;
};

function EmpresasPage() {
  const { workspaceId, role } = useWorkspace();
  const { roles, user } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CompanyRow | null>(null);
  const [saving, setSaving] = useState(false);

  const isAdmin = isAdminRole((role ?? "vendedor") as AppRole) || roles.includes("super_admin");

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["empresas-list", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<CompanyRow[]> => {
      const { data: cs, error } = await supabase
        .from("companies")
        .select("id, razao_social, cnpj, segment, company_size, assigned_to, created_at")
        .eq("workspace_id", workspaceId!)
        .order("razao_social", { ascending: true });
      if (error) throw error;
      const rows = (cs ?? []) as Array<Omit<CompanyRow, "last_run" | "open_opportunities" | "assigned_name">>;
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.id);

      const [{ data: runs }, { data: opps }, { data: profs }] = await Promise.all([
        supabase.from("agent_runs").select("company_id, created_at").in("company_id", ids),
        supabase
          .from("opportunities")
          .select("company_id, status")
          .in("company_id", ids)
          .not("status", "in", "(ganha,perdida)"),
        supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", rows.map((r) => r.assigned_to).filter((v): v is string => !!v)),
      ]);

      const lastByCompany = new Map<string, string>();
      (runs ?? []).forEach((r) => {
        if (!r.company_id) return;
        const cur = lastByCompany.get(r.company_id);
        if (!cur || r.created_at > cur) lastByCompany.set(r.company_id, r.created_at);
      });
      const openByCompany = new Map<string, number>();
      (opps ?? []).forEach((o) => {
        if (!o.company_id) return;
        openByCompany.set(o.company_id, (openByCompany.get(o.company_id) ?? 0) + 1);
      });
      const nameById = new Map<string, string>();
      (profs ?? []).forEach((p) => nameById.set(p.id, p.full_name ?? ""));

      return rows.map((r) => ({
        ...r,
        last_run: lastByCompany.get(r.id) ?? null,
        open_opportunities: openByCompany.get(r.id) ?? 0,
        assigned_name: r.assigned_to ? nameById.get(r.assigned_to) ?? null : null,
      }));
    },
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return companies;
    return companies.filter(
      (c) =>
        c.razao_social.toLowerCase().includes(s) ||
        (c.cnpj ?? "").toLowerCase().includes(s) ||
        (c.segment ?? "").toLowerCase().includes(s),
    );
  }, [companies, q]);

  const create = async (v: CompanyFormValues) => {
    if (!workspaceId || !user) return;
    setSaving(true);
    const { error } = await supabase.from("companies").insert({
      workspace_id: workspaceId,
      created_by: user.id,
      ...v,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Conta criada");
    setCreateOpen(false);
    qc.invalidateQueries({ queryKey: ["empresas-list"] });
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("companies").delete().eq("id", deleteTarget.id);
    if (error) return toast.error(error.message);
    toast.success("Conta excluída");
    setDeleteTarget(null);
    qc.invalidateQueries({ queryKey: ["empresas-list"] });
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <Building2 className="h-7 w-7 text-primary" /> Empresas
          </h1>
          <p className="text-muted-foreground mt-1">Contas do workspace, oportunidades e histórico consolidado.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Nova conta
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por razão social, CNPJ ou segmento"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-sm text-muted-foreground text-center flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center">
              <Building2 className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Nenhuma conta cadastrada.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Cadastrar primeira conta
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Razão social</TableHead>
                  <TableHead className="hidden md:table-cell">Segmento</TableHead>
                  <TableHead className="hidden md:table-cell">Vendedor</TableHead>
                  <TableHead className="text-center">Oport. abertas</TableHead>
                  <TableHead className="hidden lg:table-cell">Última atividade</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id} className="hover:bg-muted/40">
                    <TableCell>
                      <Link to="/app/empresas/$id" params={{ id: c.id }} className="font-medium hover:underline">
                        {c.razao_social}
                      </Link>
                      {c.cnpj && <div className="text-xs text-muted-foreground">{c.cnpj}</div>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {c.segment ?? "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">
                      {c.assigned_name ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      {c.open_opportunities > 0 ? (
                        <Badge variant="secondary">{c.open_opportunities}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                      {c.last_run ? new Date(c.last_run).toLocaleDateString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button asChild variant="ghost" size="icon" aria-label="Abrir">
                          <Link to="/app/empresas/$id" params={{ id: c.id }}>
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Excluir"
                            onClick={() => setDeleteTarget(c)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Nova conta</DialogTitle>
            <DialogDescription>Preencha os dados da empresa cliente.</DialogDescription>
          </DialogHeader>
          <CompanyForm submitting={saving} onSubmit={create} onCancel={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação vai remover permanentemente <strong>{deleteTarget?.razao_social}</strong> e todas as
              oportunidades vinculadas. Os agentes executados continuarão no histórico, sem vínculo com a conta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
