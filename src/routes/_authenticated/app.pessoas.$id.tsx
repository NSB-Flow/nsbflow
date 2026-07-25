import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, User as UserIcon, Briefcase, Gauge, LineChart } from "lucide-react";
import { ROLE_LABELS, type AppRole } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/app/pessoas/$id")({
  head: () => ({ meta: [{ title: "Vendedor — NSB Flow" }] }),
  component: PessoaDetail,
});

const COMPETENCIAS: Array<{ key: string; label: string }> = [
  { key: "comunicacao", label: "Comunicação" },
  { key: "escuta_ativa", label: "Escuta ativa" },
  { key: "empatia", label: "Empatia" },
  { key: "investigacao", label: "Investigação" },
  { key: "diagnostico", label: "Diagnóstico" },
  { key: "argumentacao", label: "Argumentação" },
  { key: "geracao_de_valor", label: "Geração de valor" },
  { key: "gestao_de_objecoes", label: "Gestão de objeções" },
  { key: "negociacao", label: "Negociação" },
  { key: "fechamento", label: "Fechamento" },
  { key: "organizacao", label: "Organização" },
  { key: "postura_consultiva", label: "Postura consultiva" },
];

function PessoaDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const { workspaceId } = useWorkspace();
  const navigate = useNavigate();

  // Verificação de visibilidade: self ou subordinado (respeita hierarquia)
  const { data: canView, isLoading: checkingAccess } = useQuery({
    queryKey: ["pessoa-can-view", workspaceId, user?.id, id],
    enabled: !!workspaceId && !!user,
    queryFn: async (): Promise<boolean> => {
      if (id === user!.id) return true;
      const { data, error } = await supabase.rpc("get_subordinates", {
        p_manager_id: user!.id,
        p_workspace_id: workspaceId!,
      });
      if (error) return false;
      const subs = ((data ?? []) as Array<{ get_subordinates?: string } | string>).map((r) =>
        typeof r === "string" ? r : (r.get_subordinates ?? ""),
      );
      return subs.includes(id);
    },
    staleTime: 60_000,
  });

  const { data: profile } = useQuery({
    queryKey: ["pessoa-profile", workspaceId, id],
    enabled: !!workspaceId && canView === true,
    queryFn: async () => {
      const [{ data: p }, { data: wm }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, sector").eq("id", id).maybeSingle(),
        supabase.from("workspace_members").select("role")
          .eq("workspace_id", workspaceId!).eq("user_id", id).maybeSingle(),
      ]);
      return {
        id,
        full_name: p?.full_name ?? "Usuário",
        sector: p?.sector ?? null,
        role: (wm?.role ?? null) as AppRole | null,
        email: id === user?.id ? user?.email ?? null : null,
      };
    },
  });

  // Carteira: contas onde é vendedor_principal
  const { data: carteira = [] } = useQuery({
    queryKey: ["pessoa-carteira", workspaceId, id],
    enabled: !!workspaceId && canView === true,
    queryFn: async () => {
      const { data: aa } = await supabase
        .from("account_assignments")
        .select("company_id, companies(id, razao_social, segmento)")
        .eq("workspace_id", workspaceId!)
        .eq("user_id", id)
        .eq("role_in_account", "vendedor_principal");
      const rows: Array<{ id: string; razao_social: string; segmento: string | null }> = [];
      for (const r of aa ?? []) {
        const c = Array.isArray(r.companies) ? r.companies[0] : r.companies;
        if (c) rows.push({ id: c.id as string, razao_social: c.razao_social as string, segmento: (c.segmento as string | null) ?? null });
      }

      if (rows.length === 0) return [];
      const companyIds = rows.map((r) => r.id);
      const [{ data: opps }, { data: runs }] = await Promise.all([
        supabase.from("opportunities").select("company_id, status").in("company_id", companyIds),
        supabase.from("agent_runs").select("company_id, created_at").in("company_id", companyIds).order("created_at", { ascending: false }),
      ]);
      const openByCo = new Map<string, number>();
      for (const o of opps ?? []) {
        if (o.status !== "ganha" && o.status !== "perdida" && o.company_id) {
          openByCo.set(o.company_id, (openByCo.get(o.company_id) ?? 0) + 1);
        }
      }
      const lastByCo = new Map<string, string>();
      for (const r of runs ?? []) {
        if (r.company_id && !lastByCo.has(r.company_id)) lastByCo.set(r.company_id, r.created_at);
      }
      return rows.map((r) => ({
        ...r,
        openOpps: openByCo.get(r.id) ?? 0,
        lastActivity: lastByCo.get(r.id) ?? null,
      }));
    },
  });

  // KPIs
  const { data: kpis } = useQuery({
    queryKey: ["pessoa-kpis", workspaceId, id],
    enabled: !!workspaceId && canView === true,
    queryFn: async () => {
      const [runsRes, oppsRes, maRes] = await Promise.all([
        supabase.from("agent_runs")
          .select("agent, status, company_id, created_at")
          .eq("workspace_id", workspaceId!).eq("created_by", id),
        supabase.from("opportunities")
          .select("id, status, company_id, created_at")
          .eq("workspace_id", workspaceId!).eq("created_by", id),
        supabase.from("meeting_analyses")
          .select("meeting_score, opportunity_score, nps_estimate, coaching_scores, created_at, agent_runs!inner(created_by, workspace_id, agent)")
          .eq("workspace_id", workspaceId!)
          .eq("agent_runs.agent", "deap_intelligence")
          .eq("agent_runs.created_by", id)
          .order("created_at", { ascending: true }),
      ]);
      const runs = runsRes.data ?? [];
      const doneRuns = runs.filter((r) => r.status === "done");
      const reunioes = doneRuns.filter((r) => r.agent === "deap_intelligence").length;
      const briefings = doneRuns.filter((r) => r.agent === "deap_briefing").length;
      const contasVisitadas = new Set(runs.map((r) => r.company_id).filter(Boolean)).size;

      const opps = oppsRes.data ?? [];
      const totalOpps = opps.length;
      const ganhas = opps.filter((o) => o.status === "ganha").length;
      const taxaCriacao = contasVisitadas > 0 ? totalOpps / contasVisitadas : null;
      const taxaGanha = totalOpps > 0 ? ganhas / totalOpps : null;

      const ma = (maRes.data ?? []) as Array<{
        meeting_score: number | null;
        opportunity_score: number | null;
        nps_estimate: number | null;
        coaching_scores: Record<string, number> | null;
        created_at: string;
      }>;
      const avg = (vals: Array<number | null | undefined>) => {
        const nums = vals.filter((v): v is number => v != null).map(Number);
        return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
      };
      return {
        reunioes,
        briefings,
        contasVisitadas,
        totalOpps,
        ganhas,
        taxaCriacao,
        taxaGanha,
        avgMeeting: avg(ma.map((r) => r.meeting_score)),
        avgOpp: avg(ma.map((r) => r.opportunity_score)),
        avgNps: avg(ma.map((r) => r.nps_estimate)),
        timeline: ma,
      };
    },
  });

  // Redirect after loading if access denied
  const denied = canView === false;

  const evolutionData = useMemo(() => {
    const t = kpis?.timeline ?? [];
    return t
      .filter((r) => r.coaching_scores && typeof r.coaching_scores === "object")
      .map((r) => ({
        date: r.created_at,
        scores: r.coaching_scores as Record<string, number>,
      }));
  }, [kpis]);

  if (checkingAccess) {
    return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;
  }
  if (denied) {
    return (
      <div className="p-6 md:p-8 max-w-2xl mx-auto">
        <Card>
          <CardContent className="p-6 text-sm">
            <p className="font-medium">Acesso negado.</p>
            <p className="text-muted-foreground mt-1">
              Este vendedor não está na sua cadeia de subordinados.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => navigate({ to: "/app/pessoas" })}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fmtPct = (v: number | null | undefined) =>
    v == null ? "—" : `${(v * 100).toFixed(0)}%`;
  const fmtNum = (v: number | null | undefined, digits = 1) =>
    v == null ? "—" : v.toFixed(digits);

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/app/pessoas" })}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Pessoas
        </Button>
      </div>
      <div>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <UserIcon className="h-7 w-7 text-primary" /> {profile?.full_name ?? "Vendedor"}
        </h1>
        {profile?.role && (
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="secondary">{ROLE_LABELS[profile.role]}</Badge>
            {profile.sector && <span className="text-sm text-muted-foreground">{profile.sector}</span>}
          </div>
        )}
      </div>

      {/* Seção 1: Dados cadastrais */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados cadastrais</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" value={profile?.full_name ?? "—"} />
          <Field label="E-mail" value={profile?.email ?? "—"} />
          <Field label="Setor" value={profile?.sector ?? "—"} />
          <Field label="Cargo" value={profile?.role ? ROLE_LABELS[profile.role] : "—"} />
        </CardContent>
      </Card>

      {/* Seção 2: Carteira de clientes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Briefcase className="h-4 w-4" /> Carteira de clientes
          </CardTitle>
          <CardDescription>
            Contas em que este vendedor é o principal responsável.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {carteira.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6">Sem dados ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Segmento</TableHead>
                  <TableHead className="text-right">Oportunidades abertas</TableHead>
                  <TableHead>Última atividade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carteira.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        to="/app/empresas/$id"
                        params={{ id: c.id }}
                        className="font-medium hover:underline"
                      >
                        {c.razao_social}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.segmento ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.openOpps}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.lastActivity ? new Date(c.lastActivity).toLocaleDateString("pt-BR") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Seção 3: KPIs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Gauge className="h-4 w-4" /> KPIs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!kpis || (kpis.reunioes === 0 && kpis.briefings === 0 && kpis.totalOpps === 0) ? (
            <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Reuniões realizadas" value={kpis.reunioes.toString()} />
              <Kpi label="Briefings gerados" value={kpis.briefings.toString()} />
              <Kpi label="Contas visitadas" value={kpis.contasVisitadas.toString()} />
              <Kpi label="Oportunidades criadas" value={kpis.totalOpps.toString()} />
              <Kpi label="Nota média de reunião" value={fmtNum(kpis.avgMeeting)} />
              <Kpi label="Score de oportunidade médio" value={fmtNum(kpis.avgOpp, 0)} />
              <Kpi label="Sentimento do Cliente médio" value={fmtNum(kpis.avgNps, 0)} />
              <Kpi label="Taxa de conversão (opp/conta)" value={fmtPct(kpis.taxaCriacao)} />
              <Kpi label="Taxa de ganha (ganha/opp)" value={fmtPct(kpis.taxaGanha)} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Seção 4: Evolução por competência */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <LineChart className="h-4 w-4" /> Evolução por competência
          </CardTitle>
          <CardDescription>
            Notas de coaching (0–10) por análise, do mais antigo ao mais recente.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {evolutionData.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6">Sem dados ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Competência</TableHead>
                    {evolutionData.map((r, i) => (
                      <TableHead key={i} className="text-right whitespace-nowrap">
                        {new Date(r.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Média</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {COMPETENCIAS.map((c) => {
                    const vals = evolutionData.map((r) => {
                      const v = r.scores[c.key];
                      return typeof v === "number" ? v : null;
                    });
                    const present = vals.filter((v): v is number => v != null);
                    const avg = present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
                    return (
                      <TableRow key={c.key}>
                        <TableCell className="font-medium">{c.label}</TableCell>
                        {vals.map((v, i) => (
                          <TableCell key={i} className="text-right tabular-nums">
                            {v == null ? "—" : v.toFixed(1)}
                          </TableCell>
                        ))}
                        <TableCell className="text-right tabular-nums font-medium">
                          {avg == null ? "—" : avg.toFixed(1)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium mt-0.5">{value}</div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-display font-semibold tabular-nums mt-1">{value}</div>
    </div>
  );
}
