import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2, CheckCircle2, XCircle, Clock, RefreshCw, Ban } from "lucide-react";
import {
  listAuditExportJobsFn,
  getExportDownloadUrlFn,
  cancelAuditExportFn,
  type ExportJob,
} from "@/lib/audit-export-jobs.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

const STATUS_LABEL: Record<ExportJob["status"], string> = {
  queued: "Na fila",
  processing: "Processando",
  completed: "Pronto",
  failed: "Falhou",
  canceled: "Cancelado",
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

export function ExportJobsPanel(props: {
  kind: "role_audit" | "workspace_member_audit";
  workspaceId?: string;
}) {
  const list = useServerFn(listAuditExportJobsFn);
  const download = useServerFn(getExportDownloadUrlFn);

  const { data, isFetching, refetch } = useQuery<ExportJob[]>({
    queryKey: ["export-jobs", props.kind, props.workspaceId ?? "-"],
    queryFn: () =>
      list({
        data: {
          kind: props.kind,
          workspaceId: props.workspaceId,
          limit: 10,
        },
      }),
    refetchInterval: (query) => {
      const jobs = (query.state.data as ExportJob[] | undefined) ?? [];
      return jobs.some((j) => j.status === "queued" || j.status === "processing") ? 4000 : false;
    },
    staleTime: 3000,
  });

  const jobs: ExportJob[] = data ?? [];
  if (jobs.length === 0) return null;

  const handleDownload = async (jobId: string) => {
    try {
      const { url, filename } = await download({ data: { jobId } });
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.target = "_blank";
      a.rel = "noopener";
      a.click();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar link.");
    }
  };

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="font-display text-sm">Exportações assíncronas recentes</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="h-7"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {jobs.map((j) => (
          <div
            key={j.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-xs"
          >
            <div className="flex items-center gap-2 min-w-0">
              {j.status === "queued" && <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
              {j.status === "processing" && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-gold" />
              )}
              {j.status === "completed" && (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              )}
              {j.status === "failed" && <XCircle className="h-3.5 w-3.5 text-destructive" />}
              <Badge
                variant={
                  j.status === "completed"
                    ? "default"
                    : j.status === "failed"
                      ? "destructive"
                      : "secondary"
                }
                className="uppercase text-[10px]"
              >
                {STATUS_LABEL[j.status]}
              </Badge>
              <span className="text-muted-foreground whitespace-nowrap">{fmt(j.createdAt)}</span>
              {j.status === "processing" && j.processedRows != null && (
                <span className="text-muted-foreground">
                  {j.processedRows.toLocaleString("pt-BR")} linhas…
                </span>
              )}
              {j.status === "completed" && (
                <span className="text-muted-foreground">
                  {(j.totalRows ?? 0).toLocaleString("pt-BR")} linhas
                </span>
              )}
              {j.status === "failed" && j.error && (
                <span className="text-destructive truncate max-w-[280px]" title={j.error}>
                  {j.error}
                </span>
              )}
            </div>
            {j.status === "completed" && (
              <Button size="sm" variant="outline" className="h-7" onClick={() => handleDownload(j.id)}>
                <Download className="h-3 w-3 mr-1" /> Baixar CSV
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
