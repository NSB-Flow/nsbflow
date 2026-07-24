import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, Download, RefreshCw, Search, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, FileText, FileSpreadsheet, Loader2 } from "lucide-react";
import { getRoleAuditFn, type RoleAuditEntry, type RoleAuditSort } from "@/lib/role-audit.functions";
import { useAuth } from "@/lib/auth-context";
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

export const Route = createFileRoute("/_authenticated/app/admin-role-audit")({
  head: () => ({ meta: [{ title: "Auditoria de Perfis — NSB Flow" }] }),
  component: RoleAuditPage,
});

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR");
}

function buildColumns(): ExportColumn<RoleAuditEntry>[] {
  return [
    { header: "Quando", value: (r) => fmtDate(r.createdAt), pdfWidth: 110 },
    { header: "Ação", value: (r) => (r.action === "granted" ? "Concedido" : "Removido"), pdfWidth: 70 },
    { header: "Perfil", value: (r) => ROLE_LABELS[r.role as AppRole] ?? r.role, pdfWidth: 110 },
    { header: "Usuário alvo", value: (r) => r.targetEmail ?? r.targetUserId },
    { header: "Executado por", value: (r) => r.actorEmail ?? r.actorUserId ?? "sistema" },
    { header: "IP", value: (r) => r.ip ?? "—", pdfWidth: 90 },
    { header: "Navegador", value: (r) => r.userAgent ?? "—" },
  ];
}

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

function RoleAuditPage() {
  const { roles, loading } = useAuth();

  const fetchAudit = useServerFn(getRoleAuditFn);

  const [q, setQ] = useState("");
  const [action, setAction] = useState<"all" | "granted" | "revoked">("all");
  const [sortBy, setSortBy] = useState<RoleAuditSort>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selected, setSelected] = useState<RoleAuditEntry | null>(null);

  const fromISO = fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined;
  const toISO = toDate ? new Date(`${toDate}T23:59:59.999`).toISOString() : undefined;

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["role-audit", { q, action, sortBy, sortDir, page, pageSize, fromISO, toISO }],
    queryFn: () =>
      fetchAudit({
        data: { search: q, action, sortBy, sortDir, page, pageSize, fromDate: fromISO, toDate: toISO },
      }),
    placeholderData: keepPreviousData,
    enabled: !loading && roles.includes("super_admin"),
  });


  if (loading) return null;
  if (!roles.includes("super_admin")) return <Navigate to="/app" />;

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const toggleSort = (col: RoleAuditSort) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir("desc");
    }
    setPage(0);
  };

  const sortIcon = (col: RoleAuditSort) =>
    sortBy === col ? (
      sortDir === "asc" ? (
        <ArrowUp className="inline h-3 w-3 ml-1" />
      ) : (
        <ArrowDown className="inline h-3 w-3 ml-1" />
      )
    ) : null;

  const filterMeta = [
    { label: "Filtro de ação", value: action === "all" ? "Todos" : action === "granted" ? "Concedidos" : "Removidos" },
    { label: "Ordenação", value: `${sortBy} (${sortDir === "asc" ? "crescente" : "decrescente"})` },
    ...(q.trim() ? [{ label: "Busca", value: q.trim() }] : []),
    ...(fromDate ? [{ label: "De", value: fromDate }] : []),
    ...(toDate ? [{ label: "Até", value: toDate }] : []),
  ];

  const runExport = async (scope: "page" | "all", format: "csv" | "pdf") => {
    setExporting(true);
    try {
      const cols = buildColumns();
      let data: RoleAuditEntry[] = rows;
      if (scope === "all") {
        const res = await fetchAudit({
          data: { search: q, action, sortBy, sortDir, page: 0, pageSize, fromDate: fromISO, toDate: toISO, all: true },
        });
        data = res.rows;
      }
      if (data.length === 0) {
        toast.info("Nenhum registro para exportar.");
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const scopeTag = scope === "all" ? "filtrados" : `pag${page + 1}`;
      const base = `nsb-flow-role-audit-${scopeTag}-${stamp}`;
      if (format === "csv") {
        downloadCsv(data, cols, `${base}.csv`);
      } else {
        downloadAuditPdf({
          rows: data,
          cols,
          filename: `${base}.pdf`,
          title: "Auditoria de Perfis Globais",
          subtitle: scope === "all"
            ? `Exportação de todos os eventos filtrados (limite ${5000}).`
            : `Exportação da página atual (${page + 1} de ${totalPages}).`,
          meta: filterMeta,
        });
      }
      toast.success(`Exportação ${format.toUpperCase()} concluída (${data.length} registros).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-gold/10 border border-gold/30 flex items-center justify-center">
          <ShieldCheck className="h-5 w-5 text-gold" />
        </div>
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wider text-gold font-medium">Auditoria</div>
          <h1 className="font-display text-3xl font-bold">Mudanças de Perfis</h1>
          <p className="text-sm text-muted-foreground">
            Quem concedeu ou removeu cada papel e em qual data.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" disabled={rows.length === 0 || exporting}>
                {exporting ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5 mr-1" />
                )}
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Página atual ({rows.length})</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => runExport("page", "csv")}>
                <FileSpreadsheet className="h-3.5 w-3.5 mr-2" /> CSV — página atual
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => runExport("page", "pdf")}>
                <FileText className="h-3.5 w-3.5 mr-2" /> PDF — página atual
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Todos os filtrados ({total})</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => runExport("all", "csv")}>
                <FileSpreadsheet className="h-3.5 w-3.5 mr-2" /> CSV — todos filtrados
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => runExport("all", "pdf")}>
                <FileText className="h-3.5 w-3.5 mr-2" /> PDF — todos filtrados
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>


      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="font-display text-base">
              {total} registro(s) — página {page + 1} de {totalPages}
            </CardTitle>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(0);
                }}
                placeholder="Buscar por perfil, IP ou navegador…"
                className="pl-7 h-9 w-72"
              />
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {(["all", "granted", "revoked"] as const).map((k) => (
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
                {k === "all" ? "Todos" : k === "granted" ? "Concedidos" : "Removidos"}
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
          {isLoading && !data ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma mudança registrada.</p>
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
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("role")}>
                        Perfil {sortIcon("role")}
                      </TableHead>
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
                          <Badge
                            variant={r.action === "granted" ? "default" : "destructive"}
                            className="uppercase text-[10px]"
                          >
                            {r.action === "granted" ? "Concedido" : "Removido"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {ROLE_LABELS[r.role as AppRole] ?? r.role}
                        </TableCell>
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
              { label: "Ação", value: r.action === "granted" ? "Concedido" : "Removido" },
              { label: "Perfil", value: ROLE_LABELS[r.role as AppRole] ?? r.role },
              { label: "ID do evento", value: r.id, mono: true, full: true },
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
            title="Evento de perfil"
            subtitle={r ? fmtDate(r.createdAt) : undefined}
            badge={
              r
                ? {
                    label: r.action === "granted" ? "Concedido" : "Removido",
                    variant: r.action === "granted" ? "default" : "destructive",
                  }
                : undefined
            }
            fields={fields}
            raw={r ?? {}}
          />
        );
      })()}
    </div>
  );
}
