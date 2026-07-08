import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Star, Search, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/historico")({
  head: () => ({ meta: [{ title: "Histórico — NSB Flow" }] }),
  component: HistoricoPage,
});

function HistoricoPage() {
  const [q, setQ] = useState("");
  const [agent, setAgent] = useState<string>("all");
  const [favOnly, setFavOnly] = useState(false);
  const qc = useQueryClient();

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["runs", agent, favOnly],
    queryFn: async () => {
      let query = supabase
        .from("agent_runs")
        .select("id, agent, title, company_name, cnpj, status, favorite, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (agent !== "all") query = query.eq("agent", agent);
      if (favOnly) query = query.eq("favorite", true);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = runs.filter((r) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      r.company_name?.toLowerCase().includes(s) ||
      r.title?.toLowerCase().includes(s) ||
      r.cnpj?.toLowerCase().includes(s)
    );
  });

  const del = async (id: string) => {
    if (!confirm("Excluir esta execução?")) return;
    const { error } = await supabase.from("agent_runs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Excluído");
    qc.invalidateQueries({ queryKey: ["runs"] });
  };

  const toggleFav = async (id: string, cur: boolean) => {
    await supabase.from("agent_runs").update({ favorite: !cur }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["runs"] });
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Histórico</h1>
        <p className="text-muted-foreground mt-1">Pesquise, filtre e reexporte relatórios anteriores.</p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar por empresa, título ou CNPJ" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <Select value={agent} onValueChange={setAgent}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os agentes</SelectItem>
              <SelectItem value="briefing">Briefing</SelectItem>
              <SelectItem value="meeting">Meeting Intelligence</SelectItem>
            </SelectContent>
          </Select>
          <Button variant={favOnly ? "default" : "outline"} onClick={() => setFavOnly((v) => !v)}>
            <Star className="h-4 w-4 mr-1.5" /> Favoritos
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-sm text-muted-foreground text-center">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground text-center">
              Nenhuma execução encontrada.
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 group">
                  <button onClick={() => toggleFav(r.id, r.favorite)} aria-label="Favoritar">
                    <Star className={"h-4 w-4 " + (r.favorite ? "fill-[var(--color-gold)] text-gold" : "text-muted-foreground")} />
                  </button>
                  <Link to="/app/historico/$id" params={{ id: r.id }} className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.title ?? r.company_name ?? r.agent}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("pt-BR")}
                      {r.cnpj && <> · {r.cnpj}</>}
                    </div>
                  </Link>
                  <Badge variant="outline" className="text-[10px] uppercase">{r.agent}</Badge>
                  <StatusBadge status={r.status} />
                  <Button asChild variant="ghost" size="icon" aria-label="Abrir">
                    <Link to="/app/historico/$id" params={{ id: r.id }}>
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => del(r.id)} aria-label="Excluir">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    done: { label: "Concluído", variant: "default" },
    pending: { label: "Em execução", variant: "secondary" },
    error: { label: "Erro", variant: "destructive" },
  };
  const it = map[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={it.variant}>{it.label}</Badge>;
}
