import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { TagInput } from "@/components/ui/tag-input";
import { briefingSchema, meetingSchema, type BriefingForm, type MeetingForm } from "@/lib/deap-schemas";
import { AGENT_DISPLAY_NAMES } from "@/lib/agent-names";
import { runAgentFn } from "@/lib/agent-service.functions";
import { supabase } from "@/integrations/supabase/client";
import { AgentReport } from "@/components/agent-report/AgentReport";
import { CompanyPicker, type Company } from "@/components/companies/CompanyPicker";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Loader2, FileText, Sparkles, Upload, FileAudio, Save, Star, Copy, FileDown,
  AlertTriangle, Mic, Lock, Info, CheckCircle2, UploadCloud, X, Video, RefreshCw,
} from "lucide-react";
import { useDropzone } from "react-dropzone";
import { generateReportPdf, downloadBlob } from "@/lib/pdf-report";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { useWorkspaceCredits } from "@/lib/workspace-credits";
import { useEntitlements, canUseRemoteMeetingCapture } from "@/lib/entitlements";
import { Progress } from "@/components/ui/progress";
import { Sparkles as SparklesIcon, Infinity as InfinityIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getMeetingConnectionsFn, createMeetingFn, fetchMeetingTranscriptNowFn,
} from "@/lib/meetings.functions";


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
            <Sparkles className="h-4 w-4" /> {AGENT_DISPLAY_NAMES.deap_briefing}
          </TabsTrigger>
          <TabsTrigger value="meeting" className="gap-2">
            <FileAudio className="h-4 w-4" /> {AGENT_DISPLAY_NAMES.deap_intelligence}
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

// ---------- Mic Recorder (Enterprise) ----------

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function MicRecorder({
  disabled,
  onRecorded,
  uploading,
  uploadPct,
  savedName,
  onCancelUpload,
}: {
  disabled?: boolean;
  onRecorded: (file: File) => void | Promise<void>;
  uploading?: boolean;
  uploadPct?: number;
  savedName?: string | null;
  onCancelUpload?: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [starting, setStarting] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const pickMime = () => {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
    for (const t of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
    }
    return "";
  };

  const start = async () => {
    if (recording || starting) return;
    setStarting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Seu navegador não suporta captura de áudio.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMime();
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        const type = rec.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `reuniao-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`, {
          type,
        });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        await onRecorded(file);
      };
      rec.start(1000);
      recRef.current = rec;
      setElapsed(0);
      setRecording(true);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível acessar o microfone.";
      toast.error(msg);
    } finally {
      setStarting(false);
    }
  };

  const stop = () => {
    if (!recording) return;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecording(false);
    recRef.current?.stop();
  };

  const showSaved = !recording && !uploading && !!savedName;

  return (
    <div className="rounded-lg border border-dashed p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="relative flex h-3 w-3 shrink-0">
            {recording && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-70" />
            )}
            <span
              className={
                "relative inline-flex rounded-full h-3 w-3 " +
                (recording ? "bg-destructive" : uploading ? "bg-accent" : showSaved ? "bg-emerald-500" : "bg-gold")
              }
            />
          </span>
          <div className="min-w-0">
            <div className="font-medium truncate">
              {recording
                ? "Gravando reunião…"
                : uploading
                  ? "Enviando gravação…"
                  : showSaved
                    ? "Gravação salva"
                    : "Iniciar reunião"}
            </div>
            <div className="text-xs text-muted-foreground tabular-nums truncate">
              {recording
                ? formatDuration(elapsed)
                : uploading
                  ? `${Math.round(uploadPct ?? 0)}%`
                  : showSaved
                    ? savedName
                    : "Captura pelo microfone (áudio anexado ao final)"}
            </div>
          </div>
        </div>
        {recording ? (
          <Button size="sm" variant="destructive" onClick={stop}>
            Encerrar reunião
          </Button>
        ) : uploading ? (
          <Button size="sm" variant="outline" onClick={onCancelUpload} disabled={!onCancelUpload}>
            <X className="h-3.5 w-3.5 mr-1.5" /> Cancelar
          </Button>
        ) : showSaved ? (
          <Button size="sm" variant="outline" onClick={start} disabled={disabled || starting}>
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-emerald-500" /> Regravar
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={start} disabled={disabled || starting}>
            <Mic className="h-3.5 w-3.5 mr-1.5" /> {starting ? "..." : "Iniciar"}
          </Button>
        )}
      </div>
      {uploading && <Progress value={uploadPct ?? 0} className="h-1.5" />}
    </div>
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
          agent: "deap_briefing",
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
            <TagInput value={form.solutions} onChange={(v) => setForm({ ...form, solutions: v })} placeholder="Ex.: Cloud, Segurança, IA..." />
          </Field>
          <SellerSectorField />
          <Button className="w-full" onClick={submit} disabled={loading || !company}>
            {loading ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando briefing...</>) : (<><Sparkles className="h-4 w-4 mr-2" /> Gerar Briefing</>)}
          </Button>
        </CardContent>
      </Card>

      <ResultPanel
        agent="briefing"
        reportType={AGENT_DISPLAY_NAMES.deap_briefing}
        loading={loading}
        result={result}
        company={company}
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

type CaptureMethod = "upload" | "mic_recording" | "remote_meeting";

const REMOTE_PLATFORMS: { value: "teams" | "zoom" | "google_meet"; label: string; provider: string }[] = [
  { value: "teams", label: "Microsoft Teams", provider: "microsoft" },
  { value: "zoom", label: "Zoom", provider: "zoom" },
  { value: "google_meet", label: "Google Meet", provider: "google" },
];

const REMOTE_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  scheduled: { label: "Aguardando transcrição", variant: "secondary" },
  transcript_pending: { label: "Aguardando transcrição", variant: "secondary" },
  transcript_ready: { label: "Transcrição pronta", variant: "default" },
  failed: { label: "Falhou", variant: "destructive" },
};

function RemoteMeetingPanel({
  companyId,
  workspaceId,
  disabled,
  meetingId,
  onCreated,
  onReadyChange,
}: {
  companyId: string | null;
  workspaceId: string | null;
  disabled?: boolean;
  meetingId: string | null;
  onCreated: (id: string) => void;
  onReadyChange: (ready: boolean) => void;
}) {
  const getConnections = useServerFn(getMeetingConnectionsFn);
  const createMeeting = useServerFn(createMeetingFn);
  const fetchNow = useServerFn(fetchMeetingTranscriptNowFn);

  const [platform, setPlatform] = useState<"teams" | "zoom" | "google_meet" | "">("");
  const [link, setLink] = useState("");
  const [when, setWhen] = useState("");
  const [saving, setSaving] = useState(false);
  const [polling, setPolling] = useState(false);

  const connections = useQuery({
    queryKey: ["meeting-connections", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => getConnections({ data: { workspaceId: workspaceId! } }),
  });

  const connected = (connections.data ?? []).filter((c) => c.connected);
  const availablePlatforms = REMOTE_PLATFORMS.filter((p) =>
    connected.some((c) => c.provider === p.provider),
  );

  const meeting = useQuery({
    queryKey: ["deap-remote-meeting", meetingId],
    enabled: !!meetingId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meetings")
        .select("id, status, meeting_link, platform, scheduled_at, transcript_text, last_error")
        .eq("id", meetingId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    onReadyChange(meeting.data?.status === "transcript_ready");
  }, [meeting.data?.status, onReadyChange]);

  const save = async () => {
    if (!companyId) return toast.error("Selecione a conta");
    if (!platform) return toast.error("Escolha a plataforma");
    if (!link.trim()) return toast.error("Cole o link da reunião");
    setSaving(true);
    try {
      const r = await createMeeting({
        data: {
          workspaceId: workspaceId!,
          companyId,
          platform,
          meetingLink: link.trim(),
          scheduledAt: when ? new Date(when).toISOString() : null,
        },
      });
      onCreated(r.id);
      toast.success("Reunião registrada — aguardando transcrição");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar reunião");
    } finally {
      setSaving(false);
    }
  };

  const poll = async () => {
    if (!meetingId) return;
    setPolling(true);
    try {
      const r = await fetchNow({ data: { workspaceId: workspaceId!, meetingId } });
      if (r.ready > 0) toast.success("Transcrição capturada");
      else toast.info("Transcrição ainda não disponível na plataforma");
      meeting.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao buscar transcrição");
    } finally {
      setPolling(false);
    }
  };

  if (connections.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando conexões...
      </div>
    );
  }

  if (availablePlatforms.length === 0) {
    return (
      <div className="rounded-lg border border-gold/40 bg-gold/10 p-3 space-y-2">
        <div className="flex items-start gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-gold mt-0.5 shrink-0" />
          <span>Conecte sua conta em Configurações &gt; Integrações de Reunião para usar este método.</span>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/app/reunioes">Ir para Integrações de Reunião</Link>
        </Button>
      </div>
    );
  }

  if (meetingId && meeting.data) {
    const st = REMOTE_STATUS[meeting.data.status] ?? REMOTE_STATUS.scheduled;
    return (
      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">
              {REMOTE_PLATFORMS.find((p) => p.value === meeting.data?.platform)?.label ?? meeting.data.platform}
            </div>
            <div className="text-xs text-muted-foreground truncate">{meeting.data.meeting_link}</div>
            {meeting.data.last_error && meeting.data.status !== "transcript_ready" && (
              <div className="text-xs text-destructive truncate">{meeting.data.last_error}</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={st.variant}>{st.label}</Badge>
            {meeting.data.status !== "transcript_ready" && (
              <Button size="sm" variant="ghost" disabled={polling} onClick={poll}>
                {polling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                <span className="ml-1.5">Buscar agora</span>
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          A análise via Reunião Remota consome 3 créditos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <Field label="Plataforma *">
        <Select value={platform} onValueChange={(v) => setPlatform(v as typeof platform)}>
          <SelectTrigger><SelectValue placeholder="Escolha a plataforma conectada" /></SelectTrigger>
          <SelectContent>
            {availablePlatforms.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Link da reunião *">
        <Input placeholder="https://..." value={link} onChange={(e) => setLink(e.target.value)} />
      </Field>
      <Field label="Data/hora prevista">
        <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      </Field>
      <Button variant="outline" className="w-full" onClick={save} disabled={saving || disabled || !companyId}>
        {saving ? "Registrando..." : "Registrar reunião"}
      </Button>
      <p className="text-xs text-muted-foreground">
        A transcrição é buscada automaticamente após a reunião. A análise consome 3 créditos.
      </p>
    </div>
  );
}

function MeetingTab({ initialCompanyId }: { initialCompanyId: string | null }) {
  const runAgent = useServerFn(runAgentFn);
  const { user, roles } = useAuth();
  const { workspaceId, role: workspaceRole } = useWorkspace();
  const ent = useEntitlements();
  const [company, setCompany] = useState<Company | null>(
    initialCompanyId ? { id: initialCompanyId, razao_social: "", cnpj: null } : null,
  );
  const [form, setForm] = useState<Omit<MeetingForm, "company_id">>({
    attachment_url: "",
    attachment_name: "",
  });
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ runId?: string; data?: unknown; error?: string } | null>(null);
  const [method, setMethod] = useState<CaptureMethod>("upload");
  const [remoteMeetingId, setRemoteMeetingId] = useState<string | null>(null);
  const [remoteReady, setRemoteReady] = useState(false);
  const canceledRef = useRef(false);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cancelUpload = () => {
    if (!uploading) return;
    canceledRef.current = true;
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    setUploading(false);
    setUploadPct(0);
    toast.message("Upload cancelado");
  };

  const onDrop = async (files: File[], opts?: { fromRecording?: boolean }) => {
    if (!files[0] || !user) return;
    const file = files[0];
    const fromRec = !!opts?.fromRecording;
    canceledRef.current = false;
    setUploading(true);
    setUploadPct(0);
    const path = `${user.id}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
    try {
      progressTimerRef.current = setInterval(
        () => setUploadPct((p) => Math.min(90, p + 8)),
        250,
      );
      const { error } = await supabase.storage.from("agent-uploads").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      if (canceledRef.current) {
        // Upload já concluído, mas o usuário pediu cancelamento: remove o arquivo.
        if (!error) {
          void supabase.storage.from("agent-uploads").remove([path]);
        }
        return;
      }
      if (error) throw error;
      const { data: signed, error: sErr } = await supabase.storage
        .from("agent-uploads")
        .createSignedUrl(path, 60 * 60 * 24);
      if (sErr || !signed) throw sErr ?? new Error("Não foi possível gerar URL assinada");
      setForm((f) => ({ ...f, attachment_url: signed.signedUrl, attachment_name: file.name }));
      setUploadPct(100);
      toast.success(fromRec ? "Gravação salva e anexada" : "Arquivo enviado");
    } catch (e) {
      if (canceledRef.current) return;
      const msg = e instanceof Error ? e.message : "Falha no upload";
      toast.error(msg);
    } finally {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      if (!canceledRef.current) setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPT,
    multiple: false,
    onDrop: (files) => onDrop(files),
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
          agent: "deap_intelligence",
          workspaceId,
          companyId: company.id,
          captureMethod: method,
          payload:
            method === "remote_meeting"
              ? { ...parsed.data, capture_method: method, meeting_id: remoteMeetingId }
              : { ...parsed.data, capture_method: method },
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

  const canRecordMeeting =
    roles.includes("super_admin") ||
    workspaceRole === "admin_empresa" ||
    ent.hasModule("meeting_recording");

  const canRemoteMeeting = !ent.loading && canUseRemoteMeetingCapture(ent, roles);

  const methodOptions: { value: CaptureMethod; label: string; icon: typeof Upload }[] = [
    { value: "upload", label: "Upload manual", icon: Upload },
    ...(canRecordMeeting ? [{ value: "mic_recording" as CaptureMethod, label: "Iniciar Reunião", icon: Mic }] : []),
    ...(canRemoteMeeting ? [{ value: "remote_meeting" as CaptureMethod, label: "Reunião Remota", icon: Video }] : []),
  ];

  const canSubmit =
    !!company &&
    !loading &&
    !uploading &&
    (method === "remote_meeting" ? remoteReady : !!form.attachment_url);

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="font-display">Dados da reunião</CardTitle>
          <CardDescription>Selecione a conta, escolha o método de captura e clique em Analisar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CompanySection company={company} onChange={setCompany} />

          <div className="space-y-1.5">
            <Label>Método de captura *</Label>
            <div className="grid grid-cols-3 gap-2">
              {methodOptions.map((o) => {
                const Icon = o.icon;
                const active = method === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setMethod(o.value)}
                    className={
                      "rounded-lg border p-2.5 text-xs font-medium flex flex-col items-center gap-1.5 transition-colors " +
                      (active
                        ? "border-accent bg-accent/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-accent/60")
                    }
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-center leading-tight">{o.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {method === "upload" && (
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
                {form.attachment_name && !uploading ? (
                  <CheckCircle2 className="h-6 w-6 mx-auto text-emerald-500" />
                ) : uploading ? (
                  <UploadCloud className="h-6 w-6 mx-auto text-accent animate-pulse" />
                ) : (
                  <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
                )}
                <p className="text-sm mt-2">
                  {uploading ? (
                    <span className="text-muted-foreground">Enviando… {Math.round(uploadPct)}%</span>
                  ) : form.attachment_name ? (
                    <span className="font-medium text-foreground">{form.attachment_name}</span>
                  ) : (
                    <>Arraste um arquivo ou clique para selecionar</>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {form.attachment_name && !uploading ? "Anexo pronto — clique para trocar" : "até 512 MB"}
                </p>
              </div>
              {uploading && (
                <div className="mt-2 space-y-1.5">
                  <Progress value={uploadPct} className="h-1.5" />
                  <div className="flex justify-end">
                    <Button size="sm" variant="ghost" onClick={cancelUpload}>
                      <X className="h-3.5 w-3.5 mr-1.5" /> Cancelar envio
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {method === "mic_recording" && canRecordMeeting && (
            <MicRecorder
              disabled={uploading || loading}
              uploading={uploading}
              uploadPct={uploadPct}
              savedName={form.attachment_name || null}
              onCancelUpload={cancelUpload}
              onRecorded={async (file) => {
                await onDrop([file], { fromRecording: true });
              }}
            />
          )}

          {method === "remote_meeting" && canRemoteMeeting && (
            <RemoteMeetingPanel
              companyId={company?.id ?? null}
              workspaceId={workspaceId ?? null}
              disabled={loading}
              meetingId={remoteMeetingId}
              onCreated={setRemoteMeetingId}
              onReadyChange={setRemoteReady}
            />
          )}

          <Button className="w-full" onClick={submit} disabled={!canSubmit}>
            {loading ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analisando reunião...</>) : (<><FileAudio className="h-4 w-4 mr-2" /> Analisar Reunião</>)}
          </Button>
        </CardContent>
      </Card>

      <ResultPanel
        agent="meeting"
        reportType={AGENT_DISPLAY_NAMES.deap_intelligence}
        loading={loading}
        result={result}
        company={company}
      />
    </div>
  );
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
                  Nenhum briefing foi encontrado para esta conta. Gere o Deap Briefing AI primeiro para enriquecer a análise da reunião.
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
