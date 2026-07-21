import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Shield, Download, RefreshCw, Search } from "lucide-react";
import { getSecurityEvents, type SecurityEvent } from "@/lib/security-audit.functions";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/app/admin-security")({
  head: () => ({ meta: [{ title: "Auditoria de Segurança — NSB Flow" }] }),
  component: AdminSecurityPage,
});

const CATEGORIES: { key: SecurityEvent["category"] | "all"; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "signup", label: "Cadastros" },
  { key: "login", label: "Logins" },
  { key: "membership", label: "Membros" },
  { key: "role_grant", label: "Perfis" },
  { key: "referral", label: "Indicações" },
];

type PresetKey = "24h" | "7d" | "30d" | "all" | "custom";
const PRESETS: { key: PresetKey; label: string; hours: number | null }[] = [
  { key: "24h", label: "Últimas 24h", hours: 24 },
  { key: "7d", label: "7 dias", hours: 24 * 7 },
  { key: "30d", label: "30 dias", hours: 24 * 30 },
  { key: "all", label: "Tudo", hours: null },
];

function toLocalInput(d: Date) {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR");
}

function toCsv(rows: SecurityEvent[]) {
  const header = ["timestamp", "category", "actor", "target", "detail", "ip"];
  const escape = (v: string | null) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([r.ts, r.category, r.actor, r.target, r.detail, r.ip].map(escape).join(","));
  }
  return lines.join("\n");
}

function AdminSecurityPage() {
  const { roles } = useAuth();
  if (!roles.includes("super_admin")) return <Navigate to="/app" />;

  const fetchEvents = useServerFn(getSecurityEvents);
  const { data = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-security-events"],
    queryFn: () => fetchEvents(),
  });

  const [cat, setCat] = useState<(typeof CATEGORIES)[number]["key"]>("all");
  const [q, setQ] = useState("");
  const [preset, setPreset] = useState<PresetKey>("7d");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const applyPreset = (key: PresetKey) => {
    setPreset(key);
    const now = new Date();
    const p = PRESETS.find((x) => x.key === key);
    if (!p || p.hours === null) {
      setFrom("");
      setTo("");
      return;
    }
    const start = new Date(now.getTime() - p.hours * 3600_000);
    setFrom(toLocalInput(start));
    setTo(toLocalInput(now));
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const fromMs = from ? new Date(from).getTime() : null;
    const toMs = to ? new Date(to).getTime() : null;
    return data.filter((r) => {
      if (cat !== "all" && r.category !== cat) return false;
      const ts = new Date(r.ts).getTime();
      if (fromMs !== null && ts < fromMs) return false;
      if (toMs !== null && ts > toMs) return false;
      if (!term) return true;
      return [r.actor, r.target, r.detail].some((v) => v?.toLowerCase().includes(term));
    });
  }, [data, cat, q, from, to]);

  const exportCsv = () => {
    const blob = new Blob([toCsv(filtered)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nsb-flow-security-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data.length };
    for (const r of data) c[r.category] = (c[r.category] ?? 0) + 1;
    return c;
  }, [data]);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-gold/10 border border-gold/30 flex items-center justify-center">
          <Shield className="h-5 w-5 text-gold" />
        </div>
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wider text-gold font-medium">Auditoria</div>
          <h1 className="font-display text-3xl font-bold">Eventos de Segurança</h1>
          <p className="text-sm text-muted-foreground">
            Cadastros, logins, mudanças de membros, atribuições de perfil e indicações.
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
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="font-display text-base">
              {filtered.length} evento(s) {filtered.length !== data.length && `de ${data.length}`}
            </CardTitle>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por usuário, workspace, detalhe…"
                className="pl-7 h-9 w-72"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p.key}
                size="sm"
                variant={preset === p.key ? "default" : "outline"}
                className="h-8"
                onClick={() => applyPreset(p.key)}
              >
                {p.label}
              </Button>
            ))}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted-foreground">De</label>
                <Input
                  type="datetime-local"
                  value={from}
                  onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }}
                  className="h-8 w-[180px] text-xs"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted-foreground">Até</label>
                <Input
                  type="datetime-local"
                  value={to}
                  onChange={(e) => { setTo(e.target.value); setPreset("custom"); }}
                  className="h-8 w-[180px] text-xs"
                />
              </div>
              {(from || to) && (
                <Button size="sm" variant="ghost" className="h-8" onClick={() => applyPreset("all")}>
                  Limpar
                </Button>
              )}
            </div>
          </div>
          <Tabs value={cat} onValueChange={(v) => setCat(v as any)}>
            <TabsList>
              {CATEGORIES.map((c) => (
                <TabsTrigger key={c.key} value={c.key}>
                  {c.label} <Badge variant="secondary" className="ml-2 h-4 px-1 text-[10px]">{counts[c.key] ?? 0}</Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando eventos…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento encontrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Quando</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Ator</TableHead>
                    <TableHead>Alvo</TableHead>
                    <TableHead>Detalhe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{fmtDate(r.ts)}</TableCell>
                      <TableCell><Badge variant="outline" className="uppercase text-[10px]">{r.category}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{r.actor ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{r.target ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.detail}</TableCell>
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
