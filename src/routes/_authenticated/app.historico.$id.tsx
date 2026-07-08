import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AgentReport } from "@/components/agent-report/AgentReport";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileDown, Star, Trash2 } from "lucide-react";
import { generateReportPdf, downloadBlob } from "@/lib/pdf-report";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/historico/$id")({
  head: () => ({ meta: [{ title: "Detalhes — Histórico" }] }),
  component: HistoricoDetail,
});

function HistoricoDetail() {
  const { id } = Route.useParams();
  const { fullName, user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();

  const { data: run, isLoading } = useQuery({
    queryKey: ["run", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("agent_runs").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Carregando...</div>;
  if (!run) return <div className="p-8">Não encontrado.</div>;

  const reportType = run.agent === "briefing" ? "DEAP Briefing" : run.agent === "meeting" ? "DEAP Meeting Intelligence" : run.agent;

  const exportPdf = async () => {
    if (!run.result) return toast.error("Sem resultado para exportar");
    const blob = await generateReportPdf(
      {
        reportType,
        companyName: run.company_name,
        cnpj: run.cnpj,
        clientName: run.company_name,
        author: fullName ?? user?.email ?? "NSB Flow",
        date: new Date(run.created_at).toLocaleDateString("pt-BR"),
      },
      run.result,
    );
    const safe = (run.company_name ?? "relatorio").replace(/[^\w\-]+/g, "_");
    downloadBlob(blob, `${reportType.replace(/\s+/g, "_")}-${safe}.pdf`);
  };

  const toggleFav = async () => {
    await supabase.from("agent_runs").update({ favorite: !run.favorite }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["run", id] });
  };

  const del = async () => {
    if (!confirm("Excluir esta execução?")) return;
    const { error } = await supabase.from("agent_runs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Excluído");
    nav({ to: "/app/historico" });
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/app/historico"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link>
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={toggleFav}>
            <Star className={"h-4 w-4 mr-1.5 " + (run.favorite ? "fill-[var(--color-gold)] text-gold" : "")} />
            {run.favorite ? "Favorito" : "Favoritar"}
          </Button>
          <Button variant="outline" size="sm" onClick={del}>
            <Trash2 className="h-4 w-4 mr-1.5" /> Excluir
          </Button>
          <Button size="sm" onClick={exportPdf} disabled={!run.result}>
            <FileDown className="h-4 w-4 mr-1.5" /> Exportar PDF
          </Button>
        </div>
      </div>
      <div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Badge variant="outline">{run.agent}</Badge>
          <span>{new Date(run.created_at).toLocaleString("pt-BR")}</span>
        </div>
        <h1 className="font-display text-3xl font-bold mt-1">{run.company_name ?? run.title ?? "Relatório"}</h1>
        {run.cnpj && <p className="text-sm text-muted-foreground">CNPJ {run.cnpj}</p>}
      </div>

      {run.status === "error" && (
        <Card className="border-destructive">
          <CardContent className="p-4 text-sm">
            <div className="font-medium text-destructive">Execução com erro</div>
            <div className="text-muted-foreground">{run.error}</div>
          </CardContent>
        </Card>
      )}

      {run.result != null && <AgentReport data={run.result} />}
    </div>
  );
}
