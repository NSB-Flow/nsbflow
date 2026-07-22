import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";
import { SOLUTIONS, briefingSchema, meetingSchema, type BriefingForm, type MeetingForm } from "@/lib/deap-schemas";
import { runAgentFn } from "@/lib/agent-service.functions";
import { supabase } from "@/integrations/supabase/client";
import { AgentReport } from "@/components/agent-report/AgentReport";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Loader2, FileText, Sparkles, Upload, FileAudio, Save, Star, Copy, FileDown } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { generateReportPdf, downloadBlob } from "@/lib/pdf-report";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { useWorkspaceCredits } from "@/lib/workspace-credits";
import { Progress } from "@/components/ui/progress";
import { Sparkles as SparklesIcon, Infinity as InfinityIcon } from "lucide-react";

function CreditsBadge() {
  const c = useWorkspaceCredits();
  if (c.loading) return null;
  return (
    <Link
      to="/app/assinatura"
      className="border rounded-lg px-3 py-2 flex items-center gap-2 hover:bg-muted/40 transition"
    >
      <SparklesIcon className="h-4 w-4 text-gold" />
      <div className="text-xs">
        <div className="uppercase tracking-wider text-muted-foreground">Créditos</div>
        <div className="font-display font-semibold text-sm flex items-center gap-1">
          {c.unlimited ? (<><InfinityIcon className="h-3.5 w-3.5" /> Ilimitado</>)
            : <>{c.workspaceBalance}{c.userEligible && c.userBalance > 0 ? ` + ${c.userBalance}` : ""}</>}
        </div>
      </div>
    </Link>
  );
}

export const Route = createFileRoute("/_authenticated/app/deap-meeting")({
  head: () => ({ meta: [{ title: "DEAP Meeting — NSB Flow" }] }),
  component: DeapMeeting,
});

function DeapMeeting() {
  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-wider text-gold font-medium">DEAP Method™</div>
          <h1 className="font-display text-3xl font-bold mt-1">DEAP Meeting</h1>
          <p className="text-muted-foreground mt-1">
            Briefings executivos e análise inteligente de reuniões.
          </p>
        </div>
        <CreditsBadge />
      </div>

      <Tabs defaultValue="briefing">
        <TabsList>
          <TabsTrigger value="briefing" className="gap-2">
            <Sparkles className="h-4 w-4" /> Briefing AI
          </TabsTrigger>
          <TabsTrigger value="meeting" className="gap-2">
            <FileAudio className="h-4 w-4" /> Meeting Intelligence AI
          </TabsTrigger>
        </TabsList>

        <TabsContent value="briefing" className="mt-6">
          <BriefingTab />
        </TabsContent>
        <TabsContent value="meeting" className="mt-6">
          <MeetingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Briefing ----------

function BriefingTab() {
  const runAgent = useServerFn(runAgentFn);
  const { workspaceId } = useWorkspace();
  const [form, setForm] = useState<BriefingForm>({
    company: "",
    cnpj: "",
    objective: "",
    solutions: [],
    seller_sector: "",
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ runId?: string; data?: unknown; error?: string } | null>(null);

  const submit = async () => {
    const parsed = briefingSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      if (!workspaceId) throw new Error("Workspace não selecionado.");
      const r = await runAgent({ data: { agent: "briefing", workspaceId, payload: parsed.data } });
      if (r.status === "error") {
        setResult({ runId: r.runId, error: r.error ?? "Erro" });
        toast.error(r.error ?? "Falha ao gerar briefing");
      } else {
        setResult({ runId: r.runId, data: r.result });
        toast.success("Briefing gerado");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro";
      toast.error(msg);
      setResult({ error: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="font-display">Dados da conta</CardTitle>
          <CardDescription>Preencha e clique em Gerar Briefing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Razão social *">
            <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </Field>
          <Field label="CNPJ *">
            <Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
          </Field>
          <Field label="Objetivo comercial">
            <Textarea rows={3} value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} placeholder="Ex.: expandir participação em cloud e segurança..." />
          </Field>
          <Field label="Soluções a ofertar *">
            <MultiSelect options={SOLUTIONS} value={form.solutions} onChange={(v) => setForm({ ...form, solutions: v })} />
          </Field>
          <Field label="Setor do vendedor">
            <Input value={form.seller_sector} onChange={(e) => setForm({ ...form, seller_sector: e.target.value })} placeholder="Corporate, Enterprise, SMB..." />
          </Field>
          <Button className="w-full" onClick={submit} disabled={loading}>
            {loading ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando briefing...</>) : (<><Sparkles className="h-4 w-4 mr-2" /> Gerar Briefing</>)}
          </Button>
        </CardContent>
      </Card>

      <ResultPanel
        agent="briefing"
        reportType="DEAP Briefing"
        loading={loading}
        result={result}
        payload={form}
      />
    </div>
  );
}

// ---------- Meeting ----------

const ACCEPT = {
  "audio/*": [".mp3", ".m4a", ".wav", ".ogg", ".webm"],
  "video/*": [".mp4", ".mov", ".webm"],
  "text/plain": [".txt"],
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};

function MeetingTab() {
  const runAgent = useServerFn(runAgentFn);
  const { user } = useAuth();
  const { workspaceId } = useWorkspace();
  const [form, setForm] = useState<MeetingForm>({
    company: "",
    cnpj: "",
    objective: "",
    solutions: [],
    seller_sector: "",
    attachment_url: "",
    attachment_name: "",
  });
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ runId?: string; data?: unknown; error?: string } | null>(null);

  const onDrop = async (files: File[]) => {
    if (!files[0] || !user) return;
    const file = files[0];
    setUploading(true);
    setUploadPct(0);
    try {
      const path = `${user.id}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      // Fake progress ticker (Supabase JS doesn't emit progress)
      const t = setInterval(() => setUploadPct((p) => Math.min(90, p + 8)), 250);
      const { error } = await supabase.storage.from("agent-uploads").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });
      clearInterval(t);
      if (error) throw error;
      const { data: signed, error: sErr } = await supabase.storage
        .from("agent-uploads")
        .createSignedUrl(path, 60 * 60 * 24); // 24h
      if (sErr || !signed) throw sErr ?? new Error("Não foi possível gerar URL assinada");
      setForm((f) => ({ ...f, attachment_url: signed.signedUrl, attachment_name: file.name }));
      setUploadPct(100);
      toast.success("Arquivo enviado");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha no upload";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPT,
    multiple: false,
    onDrop,
    maxSize: 512 * 1024 * 1024,
  });

  const submit = async () => {
    const parsed = meetingSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      if (!workspaceId) throw new Error("Workspace não selecionado.");
      const r = await runAgent({ data: { agent: "meeting", workspaceId, payload: parsed.data } });
      if (r.status === "error") {
        setResult({ runId: r.runId, error: r.error ?? "Erro" });
        toast.error(r.error ?? "Falha ao analisar reunião");
      } else {
        setResult({ runId: r.runId, data: r.result });
        toast.success("Reunião analisada");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro";
      toast.error(msg);
      setResult({ error: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="font-display">Dados da reunião</CardTitle>
          <CardDescription>Envie a gravação ou transcrição e clique em Analisar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Razão social *">
            <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </Field>
          <Field label="CNPJ *">
            <Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} />
          </Field>
          <Field label="Objetivo">
            <Textarea rows={2} value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} />
          </Field>
          <Field label="Soluções que desejava ofertar *">
            <MultiSelect options={SOLUTIONS} value={form.solutions} onChange={(v) => setForm({ ...form, solutions: v })} />
          </Field>

          <div>
            <Label className="mb-1.5 block">Upload (áudio, vídeo, TXT, DOCX, PDF) *</Label>
            <div
              {...getRootProps()}
              className={
                "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors " +
                (isDragActive ? "border-accent bg-accent/5" : "border-border hover:border-accent/60")
              }
            >
              <input {...getInputProps()} />
              <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
              <p className="text-sm mt-2">
                {form.attachment_name ? (
                  <span className="font-medium text-foreground">{form.attachment_name}</span>
                ) : (
                  <>Arraste um arquivo ou clique para selecionar</>
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-1">até 512 MB</p>
            </div>
            {uploading && <Progress value={uploadPct} className="mt-2 h-1.5" />}
          </div>

          <Button className="w-full" onClick={submit} disabled={loading || uploading || !form.attachment_url}>
            {loading ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analisando reunião...</>) : (<><FileAudio className="h-4 w-4 mr-2" /> Analisar Reunião</>)}
          </Button>
        </CardContent>
      </Card>

      <ResultPanel
        agent="meeting"
        reportType="DEAP Meeting Intelligence"
        loading={loading}
        result={result}
        payload={form}
      />
    </div>
  );
}

// ---------- Shared ----------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

interface ResultProps {
  agent: string;
  reportType: string;
  loading: boolean;
  result: { runId?: string; data?: unknown; error?: string } | null;
  payload: { company: string; cnpj: string };
}

function ResultPanel({ agent, reportType, loading, result, payload }: ResultProps) {
  const { fullName, user } = useAuth();
  const nav = useNavigate();

  const exportPdf = async () => {
    if (!result?.data) return;
    const blob = await generateReportPdf(
      {
        reportType,
        companyName: payload.company,
        cnpj: payload.cnpj,
        clientName: payload.company,
        author: fullName ?? user?.email ?? "NSB Flow",
        date: new Date().toLocaleDateString("pt-BR"),
      },
      result.data,
    );
    const safe = payload.company.replace(/[^\w\-]+/g, "_") || "relatorio";
    downloadBlob(blob, `${reportType.replace(/\s+/g, "_")}-${safe}.pdf`);
  };

  const toggleFavorite = async () => {
    if (!result?.runId) return;
    const { data } = await supabase.from("agent_runs").select("favorite").eq("id", result.runId).single();
    await supabase.from("agent_runs").update({ favorite: !data?.favorite }).eq("id", result.runId);
    toast.success(!data?.favorite ? "Marcado como favorito" : "Removido dos favoritos");
  };

  const duplicate = async () => {
    if (!result?.runId) return;
    nav({ to: "/app/deap-meeting" });
    toast.info("Formulário pronto para novo envio");
  };

  return (
    <div>
      {loading && (
        <Card>
          <CardContent className="py-16 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
            <div className="text-sm text-muted-foreground">
              Aguardando o agente de IA... isso pode levar até 2 minutos.
            </div>
          </CardContent>
        </Card>
      )}
      {!loading && !result && (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-3 opacity-40" />
            Preencha o formulário para gerar o relatório executivo.
          </CardContent>
        </Card>
      )}
      {!loading && result?.error && (
        <Card className="border-destructive">
          <CardContent className="py-8">
            <div className="text-sm font-medium text-destructive">Falha na execução</div>
            <div className="text-sm text-muted-foreground mt-1">{result.error}</div>
            {result.error.toLowerCase().includes("webhook") && (
              <Button asChild variant="outline" size="sm" className="mt-4">
                <a href="/app/configuracoes">Configurar webhook</a>
              </Button>
            )}
          </CardContent>
        </Card>
      )}
      {!loading && result?.data != null && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="mr-auto">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{agent}</div>
              <div className="font-display text-xl font-semibold">{payload.company || "Relatório"}</div>
            </div>
            <Button variant="outline" size="sm" onClick={toggleFavorite}><Star className="h-4 w-4 mr-1.5" /> Favoritar</Button>
            <Button variant="outline" size="sm" onClick={duplicate}><Copy className="h-4 w-4 mr-1.5" /> Duplicar</Button>
            <Button variant="outline" size="sm" onClick={() => result?.runId && nav({ to: "/app/historico/$id", params: { id: result.runId } })}>
              <Save className="h-4 w-4 mr-1.5" /> Abrir no histórico
            </Button>
            <Button size="sm" onClick={exportPdf}><FileDown className="h-4 w-4 mr-1.5" /> Exportar PDF</Button>
          </div>
          <AgentReport data={result.data} />
        </motion.div>
      )}
    </div>
  );
}
