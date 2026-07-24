import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, Download, RefreshCw, Search } from "lucide-react";
import {
  listAuditableWorkspacesFn,
  getWorkspaceMemberAuditFn,
  type WorkspaceMemberAuditEntry,
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/admin-workspace-audit")({
  head: () => ({ meta: [{ title: "Auditoria de Workspace — NSB Flow" }] }),
  component: WorkspaceAuditPage,
});

const ACTION_LABEL: Record<WorkspaceMemberAuditEntry["action"], string> = {
  added: "Adicionado",
  removed: "Removido",
  role_changed: "Papel alterado",
  activated: "Ativado",
  deactivated: "Desativado",
};

const ACTION_VARIANT: Record<WorkspaceMemberAuditEntry["action"], "default" | "destructive" | "secondary"> = {
  added: "default",
  removed: "destructive",
  role_changed: "secondary",
  activated: "default",
  deactivated: "destructive",
};

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

function toCsv(rows: WorkspaceMemberAuditEntry[]) {
  const header = ["quando", "acao", "detalhe", "usuario_alvo", "executado_por", "ip", "user_agent"];
  const esc = (v: string | null) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.createdAt,
        ACTION_LABEL[r.action],
        summary(r),
        r.targetEmail ?? r.targetUserId,
        r.actorEmail ?? r.actorUserId ?? "sistema",
        r.ip,
        r.userAgent,
      ]
        .map(esc)
        .join(","),
    );
  }
  return lines.join("\n");
}

function WorkspaceAuditPage() {
  const { roles, loading } = useAuth();
  const { workspace, role: activeRole } = useWorkspace();

  const listWs = useServerFn(listAuditableWorkspacesFn);
  const fetchAudit = useServerFn(getWorkspaceMemberAuditFn);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: workspaces = [], isLoading: wsLoading } = useQuery({
    queryKey: ["auditable-workspaces"],
    queryFn: () => listWs(),
  });

  // Auto-select current active workspace once list is available
  useEffect(() => {
    if (selectedId || workspaces.length === 0) return;
    const preferred = workspace && workspaces.find((w) => w.id === workspace.id);
    setSelectedId((preferred ?? workspaces[0]).id);
  }, [workspaces, workspace, selectedId]);

  const { data = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["workspace-member-audit", selectedId],
    queryFn: () => fetchAudit({ data: { workspaceId: selectedId as string } }),
    enabled: !!selectedId,
  });

  const [q, setQ] = useState("");
  const [action, setAction] = useState<"all" | WorkspaceMemberAuditEntry["action"]>("all");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.filter((r) => {
      if (action !== "all" && r.action !== action) return false;
      if (!term) return true;
      return [
        r.oldRole,
        r.newRole,
        r.targetEmail,
        r.targetUserId,
        r.actorEmail,
        r.actorUserId,
        r.ip,
        r.userAgent,
      ].some((v) => v?.toLowerCase().includes(term));
    });
  }, [data, q, action]);

  if (loading) return null;

  const isSuper = roles.includes("super_admin");
  const isWsAdmin = ["super_admin", "admin", "admin_empresa", "ceo", "diretor"].includes(
    (activeRole ?? "") as string,
  );
  if (!isSuper && !isWsAdmin) return <Navigate to="/app" />;

  const exportCsv = () => {
    const wsName = workspaces.find((w) => w.id === selectedId)?.slug ?? "workspace";
    const blob = new Blob([toCsv(filtered)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nsb-flow-workspace-audit-${wsName}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const ACTION_KEYS = ["all", "added", "removed", "role_changed", "activated", "deactivated"] as const;

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
          <Button size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1" /> Exportar CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="font-display text-base">
              {selectedId
                ? `${filtered.length} registro(s) ${filtered.length !== data.length ? `de ${data.length}` : ""}`
                : "Selecione um workspace"}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select
                value={selectedId ?? ""}
                onValueChange={(v) => setSelectedId(v)}
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
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar por papel, e-mail, IP…"
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
                onClick={() => setAction(k)}
              >
                {k === "all" ? "Todos" : ACTION_LABEL[k]}
              </Button>
            ))}
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
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento registrado neste workspace.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Quando</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Detalhe</TableHead>
                    <TableHead>Usuário alvo</TableHead>
                    <TableHead>Executado por</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Navegador</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
