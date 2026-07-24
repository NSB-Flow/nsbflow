import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, Download, RefreshCw, Search } from "lucide-react";
import { getRoleAuditFn, type RoleAuditEntry } from "@/lib/role-audit.functions";
import { useAuth } from "@/lib/auth-context";
import { ROLE_LABELS, type AppRole } from "@/lib/roles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/admin-role-audit")({
  head: () => ({ meta: [{ title: "Auditoria de Perfis — NSB Flow" }] }),
  component: RoleAuditPage,
});

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR");
}

function toCsv(rows: RoleAuditEntry[]) {
  const header = ["quando", "acao", "perfil", "usuario_alvo", "executado_por", "ip", "user_agent"];
  const esc = (v: string | null) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.createdAt,
        r.action,
        r.role,
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

function RoleAuditPage() {
  const { roles, loading } = useAuth();
  if (loading) return null;
  if (!roles.includes("super_admin")) return <Navigate to="/app" />;

  const fetchAudit = useServerFn(getRoleAuditFn);
  const { data = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["role-audit"],
    queryFn: () => fetchAudit(),
  });

  const [q, setQ] = useState("");
  const [action, setAction] = useState<"all" | "granted" | "revoked">("all");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.filter((r) => {
      if (action !== "all" && r.action !== action) return false;
      if (!term) return true;
      return [r.role, r.targetEmail, r.targetUserId, r.actorEmail, r.actorUserId, r.ip, r.userAgent]
        .some((v) => v?.toLowerCase().includes(term));
    });
  }, [data, q, action]);

  const exportCsv = () => {
    const blob = new Blob([toCsv(filtered)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nsb-flow-role-audit-${new Date().toISOString().slice(0, 10)}.csv`;
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
          <h1 className="font-display text-3xl font-bold">Mudanças de Perfis</h1>
          <p className="text-sm text-muted-foreground">
            Quem concedeu ou removeu cada papel e em qual data.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
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
              {filtered.length} registro(s) {filtered.length !== data.length && `de ${data.length}`}
            </CardTitle>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por perfil, e-mail ou ID…"
                className="pl-7 h-9 w-72"
              />
            </div>
          </div>
          <div className="flex gap-2">
            {(["all", "granted", "revoked"] as const).map((k) => (
              <Button
                key={k}
                size="sm"
                variant={action === k ? "default" : "outline"}
                className="h-8"
                onClick={() => setAction(k)}
              >
                {k === "all" ? "Todos" : k === "granted" ? "Concedidos" : "Removidos"}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma mudança registrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Quando</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Usuário alvo</TableHead>
                    <TableHead>Executado por</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
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
