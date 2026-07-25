import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart3, FileDown, FileSpreadsheet, AlertTriangle, TrendingUp, Wallet } from "lucide-react";
import { AGENT_DISPLAY_NAMES } from "@/lib/agent-names";
import { generateReportsPdf, downloadBlob, downloadXlsx, type ReportPdfInput, type XlsxSheet } from "@/lib/reports-export";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip, CartesianGrid } from "recharts";
import { toast } from "sonner";
import { format, startOfWeek, startOfMonth, startOfQuarter, endOfWeek, endOfMonth, endOfQuarter } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/app/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios — NSB Flow" },
      { name: "description", content: "Painel executivo: funil, performance da equipe, saúde das contas e uso da plataforma." },
    ],
  }),
  component: RelatoriosPage,
});

// ---------- Period ----------

type Preset = "week" | "month" | "quarter" | "custom";

function computeRange(preset: Preset, customFrom: string, customTo: string) {
  const now = new Date();
  if (preset === "week") {
    return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
  }
  if (preset === "month") {
    return { from: startOfMonth(now), to: endOfMonth(now) };
  }
  if (preset === "quarter") {
    return { from: startOfQuarter(now), to: endOfQuarter(now) };
  }
  const from = customFrom ? new Date(customFrom + "T00:00:00") : startOfMonth(now);
  const to = customTo ? new Date(customTo + "T23:59:59") : endOfMonth(now);
  return { from, to };
}

function formatRange(from: Date, to: Date) {
  return `${format(from, "dd/MM/yyyy", { locale: ptBR })} — ${format(to, "dd/MM/yyyy", { locale: ptBR })}`;
}

// ---------- Component ----------

const STATUS_LABELS: Record<string, string> = {
  aberta: "Aberta",
  em_andamento: "Em andamento",
  proposta_enviada: "Proposta enviada",
  ganha: "Ganha",
  perdida: "Perdida",
};

function RelatoriosPage() {
  const { workspaceId } = useWorkspace();
  const { user, fullName } = useAuth();
  const [preset, setPreset] = useState<Preset>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [tab, setTab] = useState("overview");
  const [npsThreshold, setNpsThreshold] = useState<number>(6);

  const { from, to } = useMemo(() => computeRange(preset, customFrom, customTo), [preset, customFrom, customTo]);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const periodLabel = formatRange(from, to);

  // Visible users (self + subordinates) for team-tab per-user KPIs.
  const { data: visibleIds = [] } = useQuery({
    queryKey: ["reports-visible-ids", workspaceId, user?.id],
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

  // ---------- Overview: opportunities in period ----------
  const { data: opps = [], isLoading: loadingOpps } = useQuery({
    queryKey: ["reports-opps", workspaceId, fromIso, toIso],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opportunities")
        .select("id, title, status, monthly_value, total_contract_value, company_id, created_by, created_at, closed_at")
        .eq("workspace_id", workspaceId!)
        .gte("created_at", fromIso)
        .lte("created_at", toIso);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const funnelCounts = useMemo(() => {
    const acc: Record<string, number> = { aberta: 0, em_andamento: 0, proposta_enviada: 0, ganha: 0, perdida: 0 };
    for (const o of opps) acc[o.status as string] = (acc[o.status as string] ?? 0) + 1;
    return acc;
  }, [opps]);

  const pipelineOpen = useMemo(() => {
    return opps
      .filter((o) => ["aberta", "em_andamento", "proposta_enviada"].includes(String(o.status)))
      .reduce(
        (acc, o) => {
          acc.monthly += Number(o.monthly_value ?? 0);
          acc.total += Number(o.total_contract_value ?? 0);
          return acc;
        },
        { monthly: 0, total: 0 },
      );
  }, [opps]);

  const receita = useMemo(
    () => opps.filter((o) => o.status === "ganha").reduce((a, o) => a + Number(o.total_contract_value ?? 0), 0),
    [opps],
  );

  // ---------- Team: runs + analyses in period ----------
  const { data: teamRuns = [] } = useQuery({
    queryKey: ["reports-team-runs", workspaceId, fromIso, toIso, visibleIds],
    enabled: !!workspaceId && visibleIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_runs")
        .select("id, agent, status, created_by, created_at")
        .eq("workspace_id", workspaceId!)
        .in("created_by", visibleIds)
        .gte("created_at", fromIso)
        .lte("created_at", toIso);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const { data: teamAnalyses = [] } = useQuery({
    queryKey: ["reports-team-ma", workspaceId, fromIso, toIso, visibleIds],
    enabled: !!workspaceId && visibleIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meeting_analyses")
        .select("meeting_score, opportunity_score, nps_estimate, coaching_scores, company_id, created_at, agent_run_id, agent_runs!inner(created_by, workspace_id, agent)")
        .eq("workspace_id", workspaceId!)
        .eq("agent_runs.agent", "deap_intelligence")
        .in("agent_runs.created_by", visibleIds)
        .gte("created_at", fromIso)
        .lte("created_at", toIso);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const { data: teamOpps = [] } = useQuery({
    queryKey: ["reports-team-opps", workspaceId, fromIso, toIso, visibleIds],
    enabled: !!workspaceId && visibleIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opportunities")
        .select("status, created_by, created_at")
        .eq("workspace_id", workspaceId!)
        .in("created_by", visibleIds)
        .gte("created_at", fromIso)
        .lte("created_at", toIso);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const { data: teamProfiles = [] } = useQuery({
    queryKey: ["reports-profiles", visibleIds],
    enabled: visibleIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", visibleIds);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const teamRows = useMemo(() => {
    const nameMap = new Map(teamProfiles.map((p) => [p.id, p.full_name ?? "Usuário"]));
    type Row = { user_id: string; name: string; reunioes: number; nota: number | null; nps: number | null; oppScore: number | null; conv: number | null; opps: number; won: number };
    const acc: Record<string, { reunioes: number; nSum: number; nCount: number; npsSum: number; npsCount: number; oppSum: number; oppCount: number; opps: number; won: number }> = {};
    for (const uid of visibleIds) acc[uid] = { reunioes: 0, nSum: 0, nCount: 0, npsSum: 0, npsCount: 0, oppSum: 0, oppCount: 0, opps: 0, won: 0 };
    for (const r of teamRuns) {
      if (r.agent === "deap_intelligence" && r.status === "done" && r.created_by && acc[r.created_by]) {
        acc[r.created_by].reunioes++;
      }
    }
    for (const ma of teamAnalyses as Array<{
      meeting_score: number | null; opportunity_score: number | null; nps_estimate: number | null;
      agent_runs: { created_by: string } | { created_by: string }[] | null;
    }>) {
      const ar = Array.isArray(ma.agent_runs) ? ma.agent_runs[0] : ma.agent_runs;
      const uid = ar?.created_by;
      if (!uid || !acc[uid]) continue;
      if (ma.meeting_score != null) { acc[uid].nSum += Number(ma.meeting_score); acc[uid].nCount++; }
      if (ma.nps_estimate != null) { acc[uid].npsSum += Number(ma.nps_estimate); acc[uid].npsCount++; }
      if (ma.opportunity_score != null) { acc[uid].oppSum += Number(ma.opportunity_score); acc[uid].oppCount++; }
    }
    for (const o of teamOpps) {
      if (!o.created_by || !acc[o.created_by]) continue;
      acc[o.created_by].opps++;
      if (o.status === "ganha") acc[o.created_by].won++;
    }
    const rows: Row[] = visibleIds.map((uid) => {
      const v = acc[uid];
      return {
        user_id: uid,
        name: nameMap.get(uid) ?? "Usuário",
        reunioes: v.reunioes,
        nota: v.nCount ? v.nSum / v.nCount : null,
        nps: v.npsCount ? v.npsSum / v.npsCount : null,
        oppScore: v.oppCount ? v.oppSum / v.oppCount : null,
        conv: v.opps > 0 ? v.won / v.opps : null,
        opps: v.opps,
        won: v.won,
      };
    });
    rows.sort((a, b) => b.reunioes - a.reunioes || (b.nota ?? 0) - (a.nota ?? 0));
    return rows;
  }, [visibleIds, teamProfiles, teamRuns, teamAnalyses, teamOpps]);

  const competencyChart = useMemo(() => {
    const totals: Record<string, { sum: number; n: number }> = {};
    for (const ma of teamAnalyses as Array<{ coaching_scores: unknown }>) {
      const cs = ma.coaching_scores as Record<string, unknown> | null;
      if (!cs || typeof cs !== "object") continue;
      for (const [k, raw] of Object.entries(cs)) {
        const v = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
        if (!Number.isFinite(v)) continue;
        totals[k] = totals[k] ?? { sum: 0, n: 0 };
        totals[k].sum += v;
        totals[k].n++;
      }
    }
    return Object.entries(totals)
      .map(([k, v]) => ({ competencia: k.replace(/_/g, " "), media: +(v.sum / v.n).toFixed(2) }))
      .sort((a, b) => a.competencia.localeCompare(b.competencia));
  }, [teamAnalyses]);

  // ---------- Accounts ----------
  const { data: companies = [] } = useQuery({
    queryKey: ["reports-companies", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, razao_social, cnpj, segment, assigned_to")
        .eq("workspace_id", workspaceId!);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const companyIds = useMemo(() => companies.map((c) => c.id), [companies]);

  const { data: accountAnalyses = [] } = useQuery({
    queryKey: ["reports-accounts-ma", workspaceId, fromIso, toIso, companyIds.length],
    enabled: !!workspaceId && companyIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meeting_analyses")
        .select("company_id, meeting_score, nps_estimate, created_at")
        .eq("workspace_id", workspaceId!)
        .in("company_id", companyIds)
        .gte("created_at", fromIso)
        .lte("created_at", toIso);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const { data: accountLastActivity = [] } = useQuery({
    queryKey: ["reports-accounts-activity", workspaceId, companyIds.length],
    enabled: !!workspaceId && companyIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_runs")
        .select("company_id, created_at")
        .eq("workspace_id", workspaceId!)
        .in("company_id", companyIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const accountRows = useMemo(() => {
    type Row = { id: string; name: string; segment: string | null; nps: number | null; nota: number | null; last: string | null; risk: boolean; band: "Detrator" | "Neutro" | "Promotor" | "Sem NPS" };
    const byCo: Record<string, { npsSum: number; npsN: number; nSum: number; nN: number }> = {};
    for (const ma of accountAnalyses) {
      const id = ma.company_id as string;
      if (!id) continue;
      byCo[id] = byCo[id] ?? { npsSum: 0, npsN: 0, nSum: 0, nN: 0 };
      if (ma.nps_estimate != null) { byCo[id].npsSum += Number(ma.nps_estimate); byCo[id].npsN++; }
      if (ma.meeting_score != null) { byCo[id].nSum += Number(ma.meeting_score); byCo[id].nN++; }
    }
    const lastMap: Record<string, string> = {};
    for (const r of accountLastActivity) {
      const id = r.company_id as string | null;
      if (id && !lastMap[id]) lastMap[id] = r.created_at as string;
    }
    const now = Date.now();
    const rows: Row[] = companies.map((c) => {
      const s = byCo[c.id];
      const nps = s?.npsN ? s.npsSum / s.npsN : null;
      const nota = s?.nN ? s.nSum / s.nN : null;
      const last = lastMap[c.id] ?? null;
      const staleActivity = !last || (now - new Date(last).getTime()) > 60 * 24 * 3600 * 1000;
      const risk = (nps != null && nps < npsThreshold) || staleActivity;
      const band: Row["band"] = nps == null ? "Sem NPS" : nps >= 9 ? "Promotor" : nps >= 7 ? "Neutro" : "Detrator";
      return { id: c.id, name: c.razao_social, segment: c.segment ?? null, nps, nota, last, risk, band };
    });
    rows.sort((a, b) => Number(b.risk) - Number(a.risk) || (a.nps ?? 999) - (b.nps ?? 999));
    return rows;
  }, [companies, accountAnalyses, accountLastActivity, npsThreshold]);

  const npsBands = useMemo(() => {
    const acc: Record<string, number> = { Detrator: 0, Neutro: 0, Promotor: 0, "Sem NPS": 0 };
    for (const r of accountRows) acc[r.band]++;
    return acc;
  }, [accountRows]);

  // ---------- Usage ----------
  const { data: usageCredits = [] } = useQuery({
    queryKey: ["reports-usage-credits", workspaceId, fromIso, toIso],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_credit_transactions")
        .select("amount, kind, created_at, created_by")
        .eq("workspace_id", workspaceId!)
        .lt("amount", 0)
        .gte("created_at", fromIso)
        .lte("created_at", toIso);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const { data: usageRuns = [] } = useQuery({
    queryKey: ["reports-usage-runs", workspaceId, fromIso, toIso],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_runs")
        .select("agent, status, created_at")
        .eq("workspace_id", workspaceId!)
        .gte("created_at", fromIso)
        .lte("created_at", toIso);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const creditsConsumed = useMemo(() => usageCredits.reduce((a, r) => a + Math.abs(Number(r.amount ?? 0)), 0), [usageCredits]);
  const creditsByUser = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const r of usageCredits) {
      const k = r.created_by ?? "—";
      acc[k] = (acc[k] ?? 0) + Math.abs(Number(r.amount ?? 0));
    }
    return acc;
  }, [usageCredits]);

  const agentRanking = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const r of usageRuns) acc[r.agent as string] = (acc[r.agent as string] ?? 0) + 1;
    return Object.entries(acc)
      .map(([slug, count]) => ({ slug, name: AGENT_DISPLAY_NAMES[slug] ?? slug, count }))
      .sort((a, b) => b.count - a.count);
  }, [usageRuns]);

  const runStatus = useMemo(() => {
    const total = usageRuns.length;
    const errors = usageRuns.filter((r) => r.status === "error").length;
    const done = usageRuns.filter((r) => r.status === "done").length;
    return { total, errors, done, errorRate: total ? errors / total : 0 };
  }, [usageRuns]);

  // ---------- Exports ----------
  const author = fullName ?? user?.email ?? "NSB Flow";

  const buildPdfInput = (): ReportPdfInput => {
    if (tab === "overview") {
      return {
        title: "Relatório — Visão Geral",
        period: periodLabel,
        author,
        sections: [
          {
            heading: "Indicadores principais",
            kpis: [
              { label: "Oportunidades", value: String(opps.length) },
              { label: "Pipeline (mensal)", value: brl(pipelineOpen.monthly) },
              { label: "Pipeline (contrato)", value: brl(pipelineOpen.total) },
              { label: "Receita ganha", value: brl(receita) },
            ],
            tables: [
              {
                title: "Funil de oportunidades",
                columns: ["Status", "Quantidade"],
                rows: Object.entries(funnelCounts).map(([k, v]) => [STATUS_LABELS[k] ?? k, v]),
              },
            ],
          },
        ],
      };
    }
    if (tab === "team") {
      return {
        title: "Relatório — Performance da Equipe",
        period: periodLabel,
        author,
        sections: [
          {
            heading: "Ranking de vendedores",
            tables: [
              {
                title: "Ranking",
                columns: ["Vendedor", "Reuniões", "Nota", "Sentimento", "Score Op.", "Conversão", "Ganhas/Opps"],
                rows: teamRows.map((r) => [
                  r.name,
                  r.reunioes,
                  fmtNum(r.nota, 1),
                  fmtNum(r.nps, 1),
                  fmtNum(r.oppScore, 0),
                  r.conv != null ? `${(r.conv * 100).toFixed(0)}%` : "—",
                  `${r.won}/${r.opps}`,
                ]),
                widths: [3, 1.2, 1, 1, 1.2, 1.2, 1.4],
              },
              {
                title: "Evolução por competência (média)",
                columns: ["Competência", "Média"],
                rows: competencyChart.map((c) => [c.competencia, c.media]),
                widths: [3, 1],
              },
            ],
          },
        ],
      };
    }
    if (tab === "accounts") {
      return {
        title: "Relatório — Saúde das Contas",
        period: periodLabel,
        author,
        sections: [
          {
            heading: "Classificação por Sentimento do Cliente",
            kpis: [
              { label: "Promotores", value: String(npsBands.Promotor) },
              { label: "Neutros", value: String(npsBands.Neutro) },
              { label: "Detratores", value: String(npsBands.Detrator) },
              { label: "Em risco", value: String(accountRows.filter((r) => r.risk).length) },
            ],
            note: `Sentimento do Cliente abaixo de ${npsThreshold} ou sem atividade há mais de 60 dias sinaliza risco.`,
            tables: [
              {
                title: "Contas",
                columns: ["Empresa", "Segmento", "Sentimento", "Nota reunião", "Última atividade", "Risco"],
                rows: accountRows.map((r) => [
                  r.name,
                  r.segment ?? "—",
                  fmtNum(r.nps, 1),
                  fmtNum(r.nota, 1),
                  r.last ? format(new Date(r.last), "dd/MM/yyyy") : "—",
                  r.risk ? "SIM" : "—",
                ]),
                widths: [3, 1.5, 0.8, 1.2, 1.4, 0.8],
              },
            ],
          },
        ],
      };
    }
    return {
      title: "Relatório — Uso da Plataforma",
      period: periodLabel,
      author,
      sections: [
        {
          heading: "Créditos e execuções",
          kpis: [
            { label: "Créditos consumidos", value: String(creditsConsumed) },
            { label: "Execuções totais", value: String(runStatus.total) },
            { label: "Execuções OK", value: String(runStatus.done) },
            { label: "Taxa de erro", value: `${(runStatus.errorRate * 100).toFixed(1)}%` },
          ],
          tables: [
            {
              title: "Ranking de agentes",
              columns: ["Agente", "Execuções"],
              rows: agentRanking.map((a) => [a.name, a.count]),
              widths: [3, 1],
            },
          ],
        },
      ],
    };
  };

  const buildXlsxSheets = (): XlsxSheet[] => {
    if (tab === "overview") {
      return [
        {
          name: "Funil",
          columns: ["Status", "Quantidade"],
          rows: Object.entries(funnelCounts).map(([k, v]) => [STATUS_LABELS[k] ?? k, v]),
        },
        {
          name: "Oportunidades",
          columns: ["ID", "Título", "Status", "Mensal", "Contrato Total", "Criada em"],
          rows: opps.map((o) => [
            o.id,
            o.title ?? "",
            STATUS_LABELS[String(o.status)] ?? String(o.status),
            Number(o.monthly_value ?? 0),
            Number(o.total_contract_value ?? 0),
            o.created_at as string,
          ]),
        },
      ];
    }
    if (tab === "team") {
      return [
        {
          name: "Ranking",
          columns: ["Vendedor", "Reuniões", "Nota média", "Sentimento médio", "Score oportunidade", "Conversão", "Ganhas", "Total oportunidades"],
          rows: teamRows.map((r) => [
            r.name, r.reunioes,
            r.nota != null ? +r.nota.toFixed(2) : "",
            r.nps != null ? +r.nps.toFixed(2) : "",
            r.oppScore != null ? +r.oppScore.toFixed(2) : "",
            r.conv != null ? +(r.conv * 100).toFixed(1) : "",
            r.won, r.opps,
          ]),
        },
        {
          name: "Competências",
          columns: ["Competência", "Média"],
          rows: competencyChart.map((c) => [c.competencia, c.media]),
        },
      ];
    }
    if (tab === "accounts") {
      return [
        {
          name: "Contas",
          columns: ["Empresa", "CNPJ", "Segmento", "Sentimento médio", "Nota reunião", "Última atividade", "Classificação", "Em risco"],
          rows: accountRows.map((r) => {
            const co = companies.find((c) => c.id === r.id);
            return [
              r.name, co?.cnpj ?? "", r.segment ?? "",
              r.nps != null ? +r.nps.toFixed(2) : "",
              r.nota != null ? +r.nota.toFixed(2) : "",
              r.last ? format(new Date(r.last), "yyyy-MM-dd") : "",
              r.band, r.risk ? "SIM" : "",
            ];
          }),
        },
      ];
    }
    return [
      {
        name: "Agentes",
        columns: ["Slug", "Agente", "Execuções"],
        rows: agentRanking.map((a) => [a.slug, a.name, a.count]),
      },
      {
        name: "Créditos por usuário",
        columns: ["Usuário", "Créditos consumidos"],
        rows: Object.entries(creditsByUser).map(([uid, n]) => [uid, n]),
      },
      {
        name: "Execuções",
        columns: ["Total", "OK", "Erro", "Taxa de erro (%)"],
        rows: [[runStatus.total, runStatus.done, runStatus.errors, +(runStatus.errorRate * 100).toFixed(2)]],
      },
    ];
  };

  const exportPdf = async () => {
    try {
      const blob = await generateReportsPdf(buildPdfInput());
      downloadBlob(blob, `relatorio-${tab}-${format(from, "yyyyMMdd")}-${format(to, "yyyyMMdd")}.pdf`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar PDF");
    }
  };

  const exportXlsx = () => {
    try {
      downloadXlsx(buildXlsxSheets(), `relatorio-${tab}-${format(from, "yyyyMMdd")}-${format(to, "yyyyMMdd")}.xlsx`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar Excel");
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <BarChart3 className="h-7 w-7 text-primary" /> Relatórios
        </h1>
        <p className="text-muted-foreground mt-1">
          Indicadores agregados, saúde das contas e uso da plataforma no período.
        </p>
      </div>

      {/* Period picker */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[220px]">
            <Label className="text-xs text-muted-foreground">Período</Label>
            <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Esta semana</SelectItem>
                <SelectItem value="month">Este mês</SelectItem>
                <SelectItem value="quarter">Este trimestre</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {preset === "custom" && (
            <>
              <div>
                <Label className="text-xs text-muted-foreground">De</Label>
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Até</Label>
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </div>
            </>
          )}
          <div className="text-sm text-muted-foreground ml-auto">
            <span className="uppercase tracking-wider text-xs">Intervalo</span>
            <div className="font-medium text-foreground">{periodLabel}</div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportPdf}>
              <FileDown className="h-4 w-4 mr-1.5" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={exportXlsx}>
              <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="team">Performance da Equipe</TabsTrigger>
          <TabsTrigger value="accounts">Saúde das Contas</TabsTrigger>
          <TabsTrigger value="usage">Uso da Plataforma</TabsTrigger>
        </TabsList>

        {/* ---------- Overview ---------- */}
        <TabsContent value="overview" className="mt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Kpi label="Oportunidades" value={String(opps.length)} />
            <Kpi label="Pipeline (mensal)" value={brl(pipelineOpen.monthly)} />
            <Kpi label="Pipeline (contrato)" value={brl(pipelineOpen.total)} />
            <Kpi label="Receita ganha" value={brl(receita)} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Funil de oportunidades</CardTitle>
              <CardDescription>Contagem por status no período selecionado.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingOpps ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : opps.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={Object.entries(funnelCounts).map(([k, v]) => ({ status: STATUS_LABELS[k] ?? k, qtd: v }))}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="status" fontSize={11} />
                      <YAxis allowDecimals={false} fontSize={11} />
                      <RTooltip />
                      <Bar dataKey="qtd" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- Team ---------- */}
        <TabsContent value="team" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Ranking de vendedores
              </CardTitle>
              <CardDescription>Métricas do período, restritas à sua hierarquia.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-right">Reuniões</TableHead>
                    <TableHead className="text-right">Nota</TableHead>
                    <TableHead className="text-right">Sentimento</TableHead>
                    <TableHead className="text-right">Score Op.</TableHead>
                    <TableHead className="text-right">Conversão</TableHead>
                    <TableHead className="text-right">Ganhas/Opps</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamRows.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">Sem dados ainda.</TableCell></TableRow>
                  ) : teamRows.map((r) => (
                    <TableRow key={r.user_id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.reunioes}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(r.nota, 1)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(r.nps, 1)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(r.oppScore, 0)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.conv != null ? `${(r.conv * 100).toFixed(0)}%` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.won}/{r.opps}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Evolução por competência</CardTitle>
              <CardDescription>Média das 12 competências de coaching no período (todos os vendedores visíveis).</CardDescription>
            </CardHeader>
            <CardContent>
              {competencyChart.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={competencyChart} layout="vertical" margin={{ left: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis type="number" fontSize={11} />
                      <YAxis type="category" dataKey="competencia" fontSize={11} width={140} />
                      <RTooltip />
                      <Bar dataKey="media" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- Accounts ---------- */}
        <TabsContent value="accounts" className="mt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Kpi label="Promotores" value={String(npsBands.Promotor)} />
            <Kpi label="Neutros" value={String(npsBands.Neutro)} />
            <Kpi label="Detratores" value={String(npsBands.Detrator)} />
            <Kpi label="Contas em risco" value={String(accountRows.filter((r) => r.risk).length)} />
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-end justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle className="text-base">Contas visíveis</CardTitle>
                  <CardDescription>
                    Sinalização de risco: Sentimento do Cliente &lt; {npsThreshold} ou sem atividade há mais de 60 dias.
                  </CardDescription>
                </div>
                <div className="w-[180px]">
                  <Label className="text-xs text-muted-foreground">Limiar do sentimento para risco</Label>
                  <Input
                    type="number" min={0} max={10} step={1}
                    value={npsThreshold}
                    onChange={(e) => setNpsThreshold(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Segmento</TableHead>
                    <TableHead className="text-right">Sentimento</TableHead>
                    <TableHead className="text-right">Nota</TableHead>
                    <TableHead>Última atividade</TableHead>
                    <TableHead>Classificação</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accountRows.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">Sem dados ainda.</TableCell></TableRow>
                  ) : accountRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.segment ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(r.nps, 1)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(r.nota, 1)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.last ? format(new Date(r.last), "dd/MM/yyyy") : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.band === "Promotor" ? "default" : r.band === "Detrator" ? "destructive" : "secondary"}>
                          {r.band}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {r.risk && (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" /> Risco
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- Usage ---------- */}
        <TabsContent value="usage" className="mt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Kpi label="Créditos consumidos" value={String(creditsConsumed)} icon={<Wallet className="h-4 w-4" />} />
            <Kpi label="Execuções totais" value={String(runStatus.total)} />
            <Kpi label="Execuções OK" value={String(runStatus.done)} />
            <Kpi label="Taxa de erro" value={`${(runStatus.errorRate * 100).toFixed(1)}%`} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ranking de agentes</CardTitle>
              <CardDescription>Execuções por agente no período.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agente</TableHead>
                    <TableHead className="text-right">Execuções</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentRanking.length === 0 ? (
                    <TableRow><TableCell colSpan={2} className="text-center text-sm text-muted-foreground py-8">Sem dados ainda.</TableCell></TableRow>
                  ) : agentRanking.map((a) => (
                    <TableRow key={a.slug}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Helpers ----------

function Kpi({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          {icon} {label}
        </div>
        <div className="mt-1 font-display text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
}

function fmtNum(n: number | null | undefined, digits: number) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(digits);
}
