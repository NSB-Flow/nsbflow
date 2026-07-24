import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, Download, RefreshCw, Search, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, FileText, FileSpreadsheet, Loader2 } from "lucide-react";
import {
  listAuditableWorkspacesFn,
  getWorkspaceMemberAuditFn,
  type WorkspaceMemberAuditEntry,
  type WorkspaceAuditSort,
} from "@/lib/workspace-audit.functions";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { ROLE_LABELS, type AppRole } from "@/lib/roles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AuditDetailSheet, type AuditField } from "@/components/audit/AuditDetailSheet";
import { downloadCsv, downloadAuditPdf, type ExportColumn } from "@/lib/audit-export";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/admin-workspace-audit")({
  head: () => ({ meta: [{ title: "Auditoria de Workspace — NSB Flow" }] }),
  component: WorkspaceAuditPage,
});

type Action = WorkspaceMemberAuditEntry["action"];

const ACTION_LABEL: Record<Action, string> = {
  added: "Adicionado",
  removed: "Removido",
  role_changed: "Papel alterado",
  activated: "Ativado",
  deactivated: "Desativado",
};

const ACTION_VARIANT: Record<Action, "default" | "destructive" | "secondary"> = {
  added: "default",
  removed: "destructive",
  role_changed: "secondary",
  activated: "default",
  deactivated: "destructive",
};

const ACTION_KEYS = ["all", "added", "removed", "role_changed", "activated", "deactivated"] as const;
const PAGE_SIZES = [25, 50, 100, 200];

function applyQuickPeriod(
  type: "7" | "30" | "month",
  setFrom: (v: string) => void,
  setTo: (v: string) => void,
  setPage: (v: number) => void,
) {
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  let from: string;
  if (type === "month") {
    from = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  } else {
    const d = new Date(today);
    d.setDate(d.getDate() - Number(type));
    from = d.toISOString().slice(0, 10);
  }
  setFrom(from);
  setTo(to);
  setPage(0);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR");
}

function labelRole(r: string | null) {
  if (!r) return "—";
  return ROLE_LABELS[r as AppRole] ?? r;
}

function summary(r: WorkspaceMemberAuditEntry) {
  switch (r.action) {
    case "added":
      return `entrou como ${labelRole(r.newRole)}`;
    case "removed":
      return `removido (era ${labelRole(r.oldRole)})`;
    case "role_changed":
      return `${labelRole(r.oldRole)} → ${labelRole(r.newRole)}`;
    case "activated":
      return "conta reativada";
    case "deactivated":
      return "conta desativada";
  }
}

function buildColumns(): ExportColumn<WorkspaceMemberAuditEntry>[] {
  return [
    { header: "Quando", value: (r) => fmtDate(r.createdAt), pdfWidth: 110 },
    { header: "Ação", value: (r) => ACTION_LABEL[r.action], pdfWidth: 80 },
    { header: "Detalhe", value: (r) => summary(r), pdfWidth: 140 },
    { header: "Usuário alvo", value: (r) => r.targetEmail ?? r.targetUserId },
    { header: "Executado por", value: (r) => r.actorEmail ?? r.actorUserId ?? "sistema" },
    { header: "IP", value: (r) => r.ip ?? "—", pdfWidth: 90 },
    { header: "Navegador", value: (r) => r.userAgent ?? "—" },
  ];
}

function WorkspaceAuditPage() {
  const { roles, loading } = useAuth();
  const { workspace, role: activeRole } = useWorkspace();

  const listWs = useServerFn(listAuditableWorkspacesFn);
  const fetchAudit = useServerFn(getWorkspaceMemberAuditFn);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [action, setAction] = useState<"all" | Action>("all");
  const [sortBy, setSortBy] = useState<WorkspaceAuditSort>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selected, setSelected] = useState<WorkspaceMemberAuditEntry | null>(null);

  const fromISO = fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined;
  const toISO = toDate ? new Date(`${toDate}T23:59:59.999`).toISOString() : undefined;

  const { data: workspaces = [], isLoading: wsLoading } = useQuery({
    queryKey: ["auditable-workspaces"],
    queryFn: () => listWs(),
  });

  useEffect(() => {
    if (selectedId || workspaces.length === 0) return;
    const preferred = workspace && workspaces.find((w) => w.id === workspace.id);
    setSelectedId((preferred ?? workspaces[0]).id);
  }, [workspaces, workspace, selectedId]);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: [
      "workspace-member-audit",
      { workspaceId: selectedId, q, action, sortBy, sortDir, page, pageSize, fromISO, toISO },
    ],
    queryFn: () =>
      fetchAudit({
        data: {
          workspaceId: selectedId as string,
          search: q,
          action,
          sortBy,
          sortDir,
          page,
          pageSize,
          fromDate: fromISO,
          toDate: toISO,
        },
      }),
    enabled: !!selectedId,
    placeholderData: keepPreviousData,
  });


  if (loading) return null;

  const isSuper = roles.includes("super_admin");
  const isWsAdmin = ["super_admin", "admin", "admin_empresa", "ceo", "diretor"].includes(
    (activeRole ?? "") as string,
  );
  if (!isSuper && !isWsAdmin) return <Navigate to="/app" />;

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const toggleSort = (col: WorkspaceAuditSort) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir("desc");
    }
    setPage(0);
  };

  const sortIcon = (col: WorkspaceAuditSort) =>
    sortBy === col ? (
      sortDir === "asc" ? (
        <ArrowUp className="inline h-3 w-3 ml-1" />
      ) : (
        <ArrowDown className="inline h-3 w-3 ml-1" />
      )
    ) : null;

  const exportCsv = () => {
    const wsName = workspaces.find((w) => w.id === selectedId)?.slug ?? "workspace";
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nsb-flow-workspace-audit-${wsName}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-gold/10 border border-gold/30 flex items-center justify-center">
          <ShieldCheck className="h-5 w-5 text-gold" />
        </div>
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wider text-gold font-medium">Auditoria</div>
          <h1 className="font-display text-3xl font-bold">Membros do Workspace</h1>
          <p className="text-sm text-muted-foreground">
            Entradas, saídas e mudanças de papel dentro de cada workspace.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching || !selectedId}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button size="sm" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1" /> Exportar CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="font-display text-base">
              {selectedId
                ? `${total} registro(s) — página ${page + 1} de ${totalPages}`
                : "Selecione um workspace"}
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Select
                value={selectedId ?? ""}
                onValueChange={(v) => {
                  setSelectedId(v);
                  setPage(0);
                }}
                disabled={wsLoading || workspaces.length === 0}
              >
                <SelectTrigger className="h-9 w-64">
                  <SelectValue placeholder={wsLoading ? "Carregando…" : "Escolha o workspace"} />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(0);
                  }}
                  placeholder="Buscar por papel, IP ou navegador…"
                  className="pl-7 h-9 w-72"
                />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {ACTION_KEYS.map((k) => (
              <Button
                key={k}
                size="sm"
                variant={action === k ? "default" : "outline"}
                className="h-8"
                onClick={() => {
                  setAction(k);
                  setPage(0);
                }}
              >
                {k === "all" ? "Todos" : ACTION_LABEL[k as Action]}
              </Button>
            ))}
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 mr-1">
                {([
                  { key: "7", label: "Últimos 7 dias" },
                  { key: "30", label: "Últimos 30 dias" },
                  { key: "month", label: "Este mês" },
                ] as const).map((p) => (
                  <Button
                    key={p.key}
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => applyQuickPeriod(p.key, setFromDate, setToDate, setPage)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
              <label className="text-xs text-muted-foreground">De</label>
              <Input
                type="date"
                value={fromDate}
                max={toDate || undefined}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPage(0);
                }}
                className="h-8 w-40"
              />
              <label className="text-xs text-muted-foreground">Até</label>
              <Input
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPage(0);
                }}
                className="h-8 w-40"
              />
              {(fromDate || toDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    setFromDate("");
                    setToDate("");
                    setPage(0);
                  }}
                >
                  Limpar
                </Button>
              )}
            </div>
          </div>

        </CardHeader>
        <CardContent>
          {!selectedId ? (
            <p className="text-sm text-muted-foreground">
              {wsLoading
                ? "Carregando workspaces…"
                : workspaces.length === 0
                  ? "Você não administra nenhum workspace."
                  : "Selecione um workspace para ver os eventos."}
            </p>
          ) : isLoading && !data ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento registrado neste workspace.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead
                        className="whitespace-nowrap cursor-pointer select-none"
                        onClick={() => toggleSort("created_at")}
                      >
                        Quando {sortIcon("created_at")}
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("action")}>
                        Ação {sortIcon("action")}
                      </TableHead>
                      <TableHead>Detalhe</TableHead>
                      <TableHead>Usuário alvo</TableHead>
                      <TableHead>Executado por</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead>Navegador</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow
                        key={r.id}
                        onClick={() => setSelected(r)}
                        className="cursor-pointer hover:bg-muted/40"
                      >
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {fmtDate(r.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={ACTION_VARIANT[r.action]} className="uppercase text-[10px]">
                            {ACTION_LABEL[r.action]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{summary(r)}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.targetEmail ?? r.targetUserId}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.actorEmail ?? r.actorUserId ?? "sistema"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.ip ?? "—"}</TableCell>
                        <TableCell
                          className="font-mono text-xs max-w-[280px] truncate"
                          title={r.userAgent ?? ""}
                        >
                          {r.userAgent ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Itens por página</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => {
                      setPageSize(Number(v));
                      setPage(0);
                    }}
                  >
                    <SelectTrigger className="h-8 w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZES.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={page === 0 || isFetching}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Anterior
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {page + 1} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={page + 1 >= totalPages || isFetching}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {(() => {
        const r = selected;
        const fields: AuditField[] = r
          ? [
              { label: "Quando", value: fmtDate(r.createdAt) },
              { label: "Ação", value: ACTION_LABEL[r.action] },
              { label: "Detalhe", value: summary(r), full: true },
              { label: "Papel anterior", value: labelRole(r.oldRole) },
              { label: "Papel novo", value: labelRole(r.newRole) },
              { label: "Ativo anterior", value: r.oldActive == null ? "—" : r.oldActive ? "Sim" : "Não" },
              { label: "Ativo novo", value: r.newActive == null ? "—" : r.newActive ? "Sim" : "Não" },
              { label: "ID do evento", value: r.id, mono: true, full: true },
              { label: "Workspace", value: r.workspaceId, mono: true, full: true },
              { label: "Usuário alvo", value: r.targetEmail ?? "—", mono: true },
              { label: "ID alvo", value: r.targetUserId, mono: true },
              { label: "Executado por", value: r.actorEmail ?? "sistema", mono: true },
              { label: "ID executor", value: r.actorUserId ?? "—", mono: true },
              { label: "IP", value: r.ip ?? "—", mono: true },
              { label: "User agent", value: r.userAgent ?? "—", mono: true, full: true },
            ]
          : [];
        return (
          <AuditDetailSheet
            open={!!r}
            onOpenChange={(v) => !v && setSelected(null)}
            title="Evento de workspace"
            subtitle={r ? fmtDate(r.createdAt) : undefined}
            badge={r ? { label: ACTION_LABEL[r.action], variant: ACTION_VARIANT[r.action] } : undefined}
            fields={fields}
            raw={r ?? {}}
          />
        );
      })()}
    </div>
  );
}
