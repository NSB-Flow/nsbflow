import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MultiSelect } from "@/components/ui/multi-select";
import { SOLUTIONS, briefingSchema, meetingSchema, type BriefingForm, type MeetingForm } from "@/lib/deap-schemas";
import { runAgentFn } from "@/lib/agent-service.functions";
import { supabase } from "@/integrations/supabase/client";
import { AgentReport } from "@/components/agent-report/AgentReport";
import { CompanyPicker, type Company } from "@/components/companies/CompanyPicker";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Loader2, FileText, Sparkles, Upload, FileAudio, Save, Star, Copy, FileDown,
  AlertTriangle, Mic, Lock, Info,
} from "lucide-react";
import { useDropzone } from "react-dropzone";
import { generateReportPdf, downloadBlob } from "@/lib/pdf-report";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { useWorkspaceCredits } from "@/lib/workspace-credits";
import { useEntitlements } from "@/lib/entitlements";
import { Progress } from "@/components/ui/progress";
import { Sparkles as SparklesIcon, Infinity as InfinityIcon } from "lucide-react";

const searchSchema = z.object({ companyId: z.string().uuid().optional() });

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
  validateSearch: (raw) => searchSchema.parse(raw),
  component: DeapMeeting,
});

function DeapMeeting() {
  const { companyId } = Route.useSearch();
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
          <BriefingTab initialCompanyId={companyId ?? null} />
        </TabsContent>
        <TabsContent value="meeting" className="mt-6">
          <MeetingTab initialCompanyId={companyId ?? null} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Shared UI ----------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function CompanySection({
  company,
  onChange,
}: {
  company: Company | null;
  onChange: (c: Company | null) => void;
}) {
  return (
    <div className="space-y-3">
      <Field label="Conta *">
        <CompanyPicker value={company?.id ?? null} onChange={onChange} />
      </Field>
      {company && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Razão social</Label>
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{company.razao_social}</div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">CNPJ</Label>
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              {company.cnpj || <span className="text-muted-foreground">—</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SellerSectorField() {
  const { sector } = useAuth();
  if (sector && sector.trim()) {
    return (
      <Field label="Setor do vendedor">
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{sector}</div>
      </Field>
    );
  }
  return (
    <Field label="Setor do vendedor">
      <div className="rounded-md border border-dashed px-3 py-2 text-sm flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Não definido</span>
        <Button asChild size="sm" variant="ghost">
          <Link to="/app/configuracoes">Editar perfil</Link>
        </Button>
      </div>
    </Field>
  );
}

// ---------- Briefing ----------

function BriefingTab({ initialCompanyId }: { initialCompanyId: string | null }) {
  const runAgent = useServerFn(runAgentFn);
  const { workspaceId } = useWorkspace();
  const [company, setCompany] = useState<Company | null>(
    initialCompanyId ? { id: initialCompanyId, razao_social: "", cnpj: null } : null,
  );
  const [form, setForm] = useState<Omit<BriefingForm, "company_id">>({
    objective: "",
    solutions: [],
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ runId?: string; data?: unknown; error?: string } | null>(null);

  const submit = async () => {
    if (!company) return toast.error("Selecione uma conta");
    const parsed = briefingSchema.safeParse({ ...form, company_id: company.id });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      if (!workspaceId) throw new Error("Workspace não selecionado.");
      const r = await runAgent({
        data: {
          agent: "briefing",
          workspaceId,
          companyId: company.id,
          payload: parsed.data,
        },
      });
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
          <CardDescription>Selecione a conta e clique em Gerar Briefing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CompanySection company={company} onChange={setCompany} />
          <Field label="Objetivo comercial">
            <Textarea rows={3} value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} placeholder="Ex.: expandir participação em cloud e segurança..." />
          </Field>
          <Field label="Soluções a ofertar *">
            <MultiSelect options={SOLUTIONS} value={form.solutions} onChange={(v) => setForm({ ...form, solutions: v })} />
          </Field>
          <SellerSectorField />
          <Button className="w-full" onClick={submit} disabled={loading || !company}>
            {loading ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando briefing...</>) : (<><Sparkles className="h-4 w-4 mr-2" /> Gerar Briefing</>)}
          </Button>
        </CardContent>
      </Card>

      <ResultPanel
        agent="briefing"
        reportType="DEAP Briefing"
        loading={loading}
        result={result}
        company={company}
      />
    </div>
  );

  // Prefill via URL
  // eslint-disable-next-line react-hooks/exhaustive-deps
  void initialCompanyId;
}

// ---------- Meeting ----------

const ACCEPT = {
  "audio/*": [".mp3", ".m4a", ".wav", ".ogg", ".webm"],
  "video/*": [".mp4", ".mov", ".webm"],
  "text/plain": [".txt"],
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};

function MeetingTab({ initialCompanyId }: { initialCompanyId: string | null }) {
  const runAgent = useServerFn(runAgentFn);
  const { user } = useAuth();
  const { workspaceId } = useWorkspace();
  const ent = useEntitlements();
  const [company, setCompany] = useState<Company | null>(null);
  const [form, setForm] = useState<Omit<MeetingForm, "company_id">>({
    objective: "",
    solutions: [],
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
        .createSignedUrl(path, 60 * 60 * 24);
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
    if (!company) return toast.error("Selecione uma conta");
    const parsed = meetingSchema.safeParse({ ...form, company_id: company.id });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      if (!workspaceId) throw new Error("Workspace não selecionado.");
      const r = await runAgent({
        data: {
          agent: "meeting",
          workspaceId,
          companyId: company.id,
          payload: parsed.data,
        },
      });
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

  const isEnterprise = ent.planTier === "enterprise";

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="font-display">Dados da reunião</CardTitle>
          <CardDescription>Selecione a conta, envie a gravação ou transcrição e clique em Analisar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CompanySection company={company} onChange={setCompany} />
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

          {isEnterprise && (
            <div className="rounded-lg border border-dashed p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <Mic className="h-4 w-4 text-gold" />
                <div>
                  <div className="font-medium">Iniciar reunião</div>
                  <div className="text-xs text-muted-foreground">Gravação e transcrição ao vivo — em breve.</div>
                </div>
              </div>
              <Button size="sm" variant="outline" disabled>
                <Lock className="h-3.5 w-3.5 mr-1.5" /> Em breve
              </Button>
            </div>
          )}

          <Button className="w-full" onClick={submit} disabled={loading || uploading || !form.attachment_url || !company}>
            {loading ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analisando reunião...</>) : (<><FileAudio className="h-4 w-4 mr-2" /> Analisar Reunião</>)}
          </Button>
        </CardContent>
      </Card>

      <ResultPanel
        agent="meeting"
        reportType="DEAP Meeting Intelligence"
        loading={loading}
        result={result}
        company={company}
      />
    </div>
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  void initialCompanyId;
}

// ---------- Result Panel ----------

interface ResultProps {
  agent: string;
  reportType: string;
  loading: boolean;
  result: { runId?: string; data?: unknown; error?: string } | null;
  company: Company | null;
}

function ResultPanel({ agent, reportType, loading, result, company }: ResultProps) {
  const { fullName, user } = useAuth();
  const nav = useNavigate();

  const completeness =
    result?.data && typeof result.data === "object" && result.data !== null
      ? (result.data as Record<string, unknown>).analysis_completeness
      : undefined;
  const partial = completeness === "partial_no_briefing";

  const exportPdf = async () => {
    if (!result?.data || !company) return;
    const blob = await generateReportPdf(
      {
        reportType,
        companyName: company.razao_social,
        cnpj: company.cnpj ?? "",
        clientName: company.razao_social,
        author: fullName ?? user?.email ?? "NSB Flow",
        date: new Date().toLocaleDateString("pt-BR"),
      },
      result.data,
    );
    const safe = company.razao_social.replace(/[^\w\-]+/g, "_") || "relatorio";
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
              <div className="font-display text-xl font-semibold">{company?.razao_social ?? "Relatório"}</div>
            </div>
            <Button variant="outline" size="sm" onClick={toggleFavorite}><Star className="h-4 w-4 mr-1.5" /> Favoritar</Button>
            <Button variant="outline" size="sm" onClick={duplicate}><Copy className="h-4 w-4 mr-1.5" /> Duplicar</Button>
            <Button variant="outline" size="sm" onClick={() => result?.runId && nav({ to: "/app/historico/$id", params: { id: result.runId } })}>
              <Save className="h-4 w-4 mr-1.5" /> Abrir no histórico
            </Button>
            <Button size="sm" onClick={exportPdf}><FileDown className="h-4 w-4 mr-1.5" /> Exportar PDF</Button>
          </div>

          {partial && (
            <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
              <div className="text-sm">
                <div className="font-medium">Análise incompleta</div>
                <div className="text-muted-foreground">
                  Nenhum briefing foi encontrado para esta conta. Gere o Briefing AI primeiro para enriquecer a análise da reunião.
                </div>
              </div>
            </div>
          )}
          {completeness === "full" && (
            <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 text-emerald-500" />
              Análise cruzada com o briefing mais recente desta conta.
            </div>
          )}

          <AgentReport data={result.data} />
        </motion.div>
      )}
    </div>
  );
}
