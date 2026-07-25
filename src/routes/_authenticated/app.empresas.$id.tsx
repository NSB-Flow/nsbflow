import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, Building2, Pencil, Plus, Trash2, ExternalLink, Users,
  FileText, MessagesSquare, Loader2, TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { toast } from "sonner";
import { CompanyForm, type CompanyFormValues } from "@/components/companies/CompanyForm";
import {
  OpportunityForm, OPPORTUNITY_STATUSES, type OpportunityFormValues, type OpportunityStatus,
} from "@/components/companies/OpportunityForm";
import { isAdminRole, type AppRole } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/app/empresas/$id")({
  head: () => ({
    meta: [
      { title: "Detalhe da conta — NSB Flow" },
      { name: "description", content: "Dados cadastrais, indicadores, linha do tempo e oportunidades da conta." },
    ],
  }),
  component: EmpresaDetail,
});

type Company = {
  id: string;
  razao_social: string;
  cnpj: string | null;
  address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  segment: string | null;
  company_size: string | null;
  assigned_to: string | null;
  workspace_id: string;
  created_at: string;
};

type Run = {
  id: string;
  agent: string;
  title: string | null;
  status: string;
  created_by: string;
  created_at: string;
  result: unknown;
};

type Opportunity = {
  id: string;
  title: string;
  status: OpportunityStatus;
  monthly_value: number | null;
  total_contract_value: number | null;
  contract_months: number | null;
  quantity: number | null;
  agent_run_id: string | null;
  created_at: string;
  closed_at: string | null;
};

const STATUS_VARIANT: Record<OpportunityStatus, "default" | "secondary" | "outline" | "destructive"> = {
  aberta: "outline",
  em_andamento: "secondary",
  proposta_enviada: "secondary",
  ganha: "default",
  perdida: "destructive",
};

function EmpresaDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { roles } = useAuth();
  const { workspaceId, role } = useWorkspace();

  const isAdmin = isAdminRole((role ?? "vendedor") as AppRole) || roles.includes("super_admin");

  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [oppOpen, setOppOpen] = useState(false);
  const [oppEdit, setOppEdit] = useState<Opportunity | null>(null);
  const [oppDelete, setOppDelete] = useState<Opportunity | null>(null);
  const [companyDelete, setCompanyDelete] = useState(false);

  const { data: company, isLoading: loadingCompany, error } = useQuery({
    queryKey: ["empresa", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Company | null;
    },
  });

  const { data: runs = [] } = useQuery({
    queryKey: ["empresa-runs", id],
    enabled: !!company,
    queryFn: async (): Promise<Run[]> => {
      const { data, error } = await supabase
        .from("agent_runs")
        .select("id, agent, title, status, created_by, created_at, result")
        .eq("company_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Run[];
    },
  });

  const { data: opportunities = [] } = useQuery({
    queryKey: ["empresa-opps", id],
    enabled: !!company,
    queryFn: async (): Promise<Opportunity[]> => {
      const { data, error } = await supabase
        .from("opportunities")
        .select("id, title, status, monthly_value, total_contract_value, contract_months, quantity, agent_run_id, created_at, closed_at")
        .eq("company_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Opportunity[];
    },
  });

  const { data: meetingMetrics } = useQuery({
    queryKey: ["empresa-meeting-metrics", id],
    enabled: !!company,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meeting_analyses")
        .select("meeting_score, opportunity_score, nps_estimate, created_at")
        .eq("company_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      const avg = (key: "meeting_score" | "opportunity_score" | "nps_estimate") => {
        const vals = rows.map((r) => r[key]).filter((v): v is number => v != null);
        if (vals.length === 0) return null;
        return vals.reduce((a, b) => a + Number(b), 0) / vals.length;
      };
      const last = rows[0] ?? null;
      return {
        count: rows.length,
        avgMeeting: avg("meeting_score"),
        avgOpportunity: avg("opportunity_score"),
        avgNps: avg("nps_estimate"),
        lastMeeting: last?.meeting_score ?? null,
        lastOpportunity: last?.opportunity_score ?? null,
        lastNps: last?.nps_estimate ?? null,
      };
    },
  });

  // Sellers involved + assigned name lookup
  const userIds = useMemo(() => {
    const s = new Set<string>();
    runs.forEach((r) => s.add(r.created_by));
    if (company?.assigned_to) s.add(company.assigned_to);
    return Array.from(s);
  }, [runs, company?.assigned_to]);

  const { data: profileById = new Map<string, string>() } = useQuery({
    queryKey: ["empresa-profiles", id, userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
      const m = new Map<string, string>();
      (data ?? []).forEach((p) => m.set(p.id, p.full_name ?? "Usuário"));
      return m;
    },
  });

  // Indicators
  const indicators = useMemo(() => {
    const briefings = runs.filter((r) => r.agent === "briefing").length;
    const meetings = runs.filter((r) => r.agent === "meeting");
    const meetingsTotal = meetings.length;
    let full = 0;
    let partial = 0;
    meetings.forEach((m) => {
      const c = (m.result as { analysis_completeness?: string } | null)?.analysis_completeness;
      if (c === "full") full++;
      else if (c === "partial_no_briefing") partial++;
    });
    const denom = full + partial;
    const pctWithBriefing = denom > 0 ? Math.round((full / denom) * 100) : null;
    return { briefings, meetingsTotal, pctWithBriefing };
  }, [runs]);

  const sellersInvolved = useMemo(() => {
    const s = new Map<string, { id: string; name: string; runs: number }>();
    runs.forEach((r) => {
      const cur = s.get(r.created_by);
      if (cur) cur.runs++;
      else s.set(r.created_by, { id: r.created_by, name: profileById.get(r.created_by) ?? "Usuário", runs: 1 });
    });
    return Array.from(s.values()).sort((a, b) => b.runs - a.runs);
  }, [runs, profileById]);

  if (loadingCompany) {
    return (
      <div className="p-6 md:p-8 max-w-6xl mx-auto">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando conta...
        </div>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-4">
        <Button variant="ghost" asChild><Link to="/app/empresas"><ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar</Link></Button>
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Conta não encontrada ou sem acesso.</CardContent></Card>
      </div>
    );
  }

  const saveCompany = async (v: CompanyFormValues) => {
    setSaving(true);
    const { error } = await supabase.from("companies").update(v).eq("id", company.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Conta atualizada");
    setEditOpen(false);
    qc.invalidateQueries({ queryKey: ["empresa", id] });
    qc.invalidateQueries({ queryKey: ["empresas-list"] });
  };

  const deleteCompany = async () => {
    const { error } = await supabase.from("companies").delete().eq("id", company.id);
    if (error) return toast.error(error.message);
    toast.success("Conta excluída");
    qc.invalidateQueries({ queryKey: ["empresas-list"] });
    navigate({ to: "/app/empresas" });
  };

  const saveOpportunity = async (v: OpportunityFormValues) => {
    if (!workspaceId) return;
    setSaving(true);
    if (oppEdit) {
      const { error } = await supabase.from("opportunities").update(v).eq("id", oppEdit.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Oportunidade atualizada");
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSaving(false); return toast.error("Sessão expirada"); }
      const { error } = await supabase.from("opportunities").insert({
        ...v,
        company_id: company.id,
        workspace_id: workspaceId,
        created_by: user.id,
      });
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Oportunidade criada");
    }
    setOppOpen(false);
    setOppEdit(null);
    qc.invalidateQueries({ queryKey: ["empresa-opps", id] });
    qc.invalidateQueries({ queryKey: ["empresas-list"] });
  };

  const changeOppStatus = async (opp: Opportunity, status: OpportunityStatus) => {
    const { error } = await supabase.from("opportunities").update({ status }).eq("id", opp.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["empresa-opps", id] });
  };

  const deleteOpportunity = async () => {
    if (!oppDelete) return;
    const { error } = await supabase.from("opportunities").delete().eq("id", oppDelete.id);
    if (error) return toast.error(error.message);
    toast.success("Oportunidade excluída");
    setOppDelete(null);
    qc.invalidateQueries({ queryKey: ["empresa-opps", id] });
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
            <Link to="/app/empresas"><ArrowLeft className="h-4 w-4 mr-1.5" /> Empresas</Link>
          </Button>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <Building2 className="h-7 w-7 text-primary shrink-0" />
            <span className="truncate">{company.razao_social}</span>
          </h1>
          <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {company.cnpj && <span>{company.cnpj}</span>}
            {company.segment && <span>· {company.segment}</span>}
            {company.company_size && <span>· Porte {company.company_size}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-1.5" /> Editar
          </Button>
          {isAdmin && (
            <Button variant="outline" onClick={() => setCompanyDelete(true)}>
              <Trash2 className="h-4 w-4 mr-1.5 text-destructive" /> Excluir
            </Button>
          )}
        </div>
      </div>

      {/* Dados cadastrais */}
      <Card>
        <CardHeader><CardTitle className="text-base">Dados cadastrais</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4 text-sm">
          <Field label="Razão social" value={company.razao_social} />
          <Field label="CNPJ" value={company.cnpj} />
          <Field label="Segmento" value={company.segment} />
          <Field label="Porte" value={company.company_size} />
          <Field label="Vendedor responsável" value={company.assigned_to ? profileById.get(company.assigned_to) ?? "—" : null} />
          <Field label="Contato" value={company.contact_name} />
          <Field label="Telefone" value={company.contact_phone} />
          <Field label="E-mail" value={company.contact_email} />
          <Field label="Endereço" value={company.address} className="md:col-span-2" />
        </CardContent>
      </Card>

      {/* Indicadores */}
      <div className="grid md:grid-cols-3 gap-4">
        <Kpi icon={FileText} label="Briefings" value={indicators.briefings} />
        <Kpi icon={MessagesSquare} label="Análises de reunião" value={indicators.meetingsTotal} />
        <Kpi
          icon={TrendingUp}
          label="Reuniões com briefing prévio"
          value={indicators.pctWithBriefing == null ? "—" : `${indicators.pctWithBriefing}%`}
        />
        <KpiTrend
          icon={TrendingUp}
          label="Nota da reunião"
          avg={meetingMetrics?.avgMeeting ?? null}
          last={meetingMetrics?.lastMeeting ?? null}
          format={(n) => n.toFixed(1)}
        />
        <KpiTrend
          icon={TrendingUp}
          label="Score de oportunidade"
          avg={meetingMetrics?.avgOpportunity ?? null}
          last={meetingMetrics?.lastOpportunity ?? null}
          format={(n) => Math.round(n).toString()}
        />
        <KpiTrend
          icon={TrendingUp}
          label="NPS estimado"
          avg={meetingMetrics?.avgNps ?? null}
          last={meetingMetrics?.lastNps ?? null}
          format={(n) => n.toFixed(1)}
        />
      </div>

      {/* Vendedores envolvidos */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Vendedores envolvidos</CardTitle>
        </CardHeader>
        <CardContent>
          {sellersInvolved.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma execução registrada para esta conta.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sellersInvolved.map((s) => (
                <Badge key={s.id} variant="secondary" className="gap-1.5">
                  {s.name}
                  <span className="text-muted-foreground">· {s.runs}</span>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Oportunidades */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Oportunidades</CardTitle>
          <Button size="sm" onClick={() => { setOppEdit(null); setOppOpen(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> Nova oportunidade
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {opportunities.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6 text-center">Nenhuma oportunidade cadastrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Mensal</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-center">Qtd</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {opportunities.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <div className="font-medium">{o.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(o.created_at).toLocaleDateString("pt-BR")}
                        {o.contract_months ? ` · ${o.contract_months} meses` : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select value={o.status} onValueChange={(v) => changeOppStatus(o, v as OpportunityStatus)}>
                        <SelectTrigger className="h-8 w-[160px]">
                          <Badge variant={STATUS_VARIANT[o.status]} className="font-normal">
                            {OPPORTUNITY_STATUSES.find((s) => s.value === o.status)?.label}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {OPPORTUNITY_STATUSES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(o.monthly_value)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(o.total_contract_value)}</TableCell>
                    <TableCell className="text-center">{o.quantity ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => { setOppEdit(o); setOppOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {isAdmin && (
                          <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => setOppDelete(o)}>
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

      {/* Linha do tempo */}
      <Card>
        <CardHeader><CardTitle className="text-base">Linha do tempo</CardTitle></CardHeader>
        <CardContent className="p-0">
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6 text-center">Nenhuma execução registrada.</p>
          ) : (
            <div className="divide-y">
              {runs.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                  <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    {r.agent === "briefing" ? (
                      <FileText className="h-4 w-4 text-primary" />
                    ) : (
                      <MessagesSquare className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <Link to="/app/historico/$id" params={{ id: r.id }} className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.title ?? (r.agent === "briefing" ? "Briefing" : "Análise de reunião")}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("pt-BR")} · {profileById.get(r.created_by) ?? "Usuário"}
                    </div>
                  </Link>
                  <Badge variant="outline" className="text-[10px] uppercase">{r.agent}</Badge>
                  <Button asChild variant="ghost" size="icon" aria-label="Abrir">
                    <Link to="/app/historico/$id" params={{ id: r.id }}>
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit company dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Editar conta</DialogTitle>
            <DialogDescription>Atualize os dados cadastrais da empresa.</DialogDescription>
          </DialogHeader>
          <CompanyForm
            initial={company}
            submitting={saving}
            onSubmit={saveCompany}
            onCancel={() => setEditOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Opportunity dialog */}
      <Dialog open={oppOpen} onOpenChange={(o) => { setOppOpen(o); if (!o) setOppEdit(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">{oppEdit ? "Editar oportunidade" : "Nova oportunidade"}</DialogTitle>
            <DialogDescription>
              {oppEdit ? "Atualize valores e status da oportunidade." : "Registre uma oportunidade comercial vinculada a esta conta."}
            </DialogDescription>
          </DialogHeader>
          <OpportunityForm
            initial={oppEdit ?? undefined}
            submitting={saving}
            onSubmit={saveOpportunity}
            onCancel={() => { setOppOpen(false); setOppEdit(null); }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete opportunity */}
      <AlertDialog open={!!oppDelete} onOpenChange={(o) => !o && setOppDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir oportunidade?</AlertDialogTitle>
            <AlertDialogDescription>
              Remover definitivamente <strong>{oppDelete?.title}</strong>. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteOpportunity} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete company */}
      <AlertDialog open={companyDelete} onOpenChange={setCompanyDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{company.razao_social}</strong> e todas as oportunidades vinculadas.
              Os agentes executados continuarão no histórico, sem vínculo com a conta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteCompany} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, value, className }: { label: string; value: string | null; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value ?? <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold font-display">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiTrend({
  icon: Icon,
  label,
  avg,
  last,
  format,
}: {
  icon: typeof Building2;
  label: string;
  avg: number | null;
  last: number | null;
  format: (n: number) => string;
}) {
  const hasData = avg != null && last != null;

  let trendIcon = null;
  let trendClass = "text-muted-foreground";
  if (hasData) {
    if (last > avg) {
      trendIcon = <TrendingUp className="h-3.5 w-3.5" />;
      trendClass = "text-emerald-600";
    } else if (last < avg) {
      trendIcon = <TrendingDown className="h-3.5 w-3.5" />;
      trendClass = "text-rose-600";
    } else {
      trendIcon = <Minus className="h-3.5 w-3.5" />;
      trendClass = "text-muted-foreground";
    }
  }

  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
          {hasData ? (
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold font-display">{format(avg)}</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground" title="Média histórica">
                <span className="hidden sm:inline">média</span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Sem dados ainda</div>
          )}
          {hasData && (
            <div className={`flex items-center gap-1 text-xs font-medium mt-0.5 ${trendClass}`}>
              {trendIcon}
              <span>Última: {format(last)}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function money(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
