import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { useEntitlements } from "@/lib/entitlements";
import { CompanyPicker, type Company } from "@/components/companies/CompanyPicker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Plug, Plus, RefreshCw, Video, FileText, Unplug, ShieldCheck, CheckCircle2, XCircle } from "lucide-react";
import {
  getMeetingConnectionsFn, startMeetingOAuthFn, disconnectMeetingProviderFn,
  createMeetingFn, fetchMeetingTranscriptNowFn, testMeetingConnectionFn,
} from "@/lib/meetings.functions";

export const Route = createFileRoute("/_authenticated/app/reunioes")({
  head: () => ({
    meta: [
      { title: "Reuniões Remotas — NSB Flow" },
      { name: "description", content: "Agende reuniões no Teams, Zoom ou Google Meet e capture a transcrição automaticamente no NSB Flow." },
      { property: "og:title", content: "Reuniões Remotas — NSB Flow" },
      { property: "og:description", content: "Captura nativa de transcrição de reuniões remotas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MeetingsPage,
});

type Provider = "microsoft" | "zoom" | "google";
type Platform = "teams" | "zoom" | "google_meet";

const PLATFORMS: { value: Platform; label: string; provider: Provider }[] = [
  { value: "teams", label: "Microsoft Teams", provider: "microsoft" },
  { value: "zoom", label: "Zoom", provider: "zoom" },
  { value: "google_meet", label: "Google Meet", provider: "google" },
];

const PROVIDER_LABEL: Record<Provider, string> = {
  microsoft: "Microsoft 365",
  zoom: "Zoom",
  google: "Google Workspace",
};

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  scheduled: { label: "Agendada", variant: "outline" },
  transcript_pending: { label: "Aguardando transcrição", variant: "secondary" },
  transcript_ready: { label: "Transcrição pronta", variant: "default" },
  failed: { label: "Falhou", variant: "destructive" },
};

interface TestCheck {
  label: string;
  scope: string;
  ok: boolean;
  status: number | null;
  ms: number;
  detail: string | null;
}

interface TestResult {
  provider: string;
  ok: boolean;
  email: string | null;
  totalMs: number;
  checks: TestCheck[];
  error: string | null;
}

interface MeetingRow {
  id: string;
  platform: string;
  meeting_link: string;
  scheduled_at: string | null;
  status: string;
  transcript_text: string | null;
  transcript_fetched_at: string | null;
  last_error: string | null;
  created_by: string;
  companies: { razao_social: string } | { razao_social: string }[] | null;
}

function MeetingsPage() {
  const { workspaceId } = useWorkspace();
  const { roles } = useAuth();
  const ent = useEntitlements();
  const qc = useQueryClient();
  const getConnections = useServerFn(getMeetingConnectionsFn);
  const startOAuth = useServerFn(startMeetingOAuthFn);
  const disconnect = useServerFn(disconnectMeetingProviderFn);
  const createMeeting = useServerFn(createMeetingFn);
  const fetchNow = useServerFn(fetchMeetingTranscriptNowFn);
  const testConnection = useServerFn(testMeetingConnectionFn);

  const hasAddon = roles.includes("super_admin") || ent.hasModule("native_meeting_capture");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("conn") === "connected") toast.success("Conta conectada com sucesso");
    if (p.get("conn") === "error") toast.error(p.get("message") ?? "Falha ao conectar");
    if (p.get("conn")) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const connections = useQuery({
    queryKey: ["meeting-connections", workspaceId],
    enabled: !!workspaceId && hasAddon,
    queryFn: () => getConnections({ data: { workspaceId: workspaceId! } }),
  });

  const meetings = useQuery({
    queryKey: ["meetings", workspaceId],
    enabled: !!workspaceId && hasAddon,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meetings")
        .select("id, platform, meeting_link, scheduled_at, status, transcript_text, transcript_fetched_at, last_error, created_by, companies(razao_social)")
        .eq("workspace_id", workspaceId!)
        .order("scheduled_at", { ascending: false, nullsFirst: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as MeetingRow[];
    },
  });

  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);
  const [opportunityId, setOpportunityId] = useState<string>("none");
  const [platform, setPlatform] = useState<Platform>("teams");
  const [link, setLink] = useState("");
  const [when, setWhen] = useState("");
  const [saving, setSaving] = useState(false);
  const [transcript, setTranscript] = useState<MeetingRow | null>(null);
  const [polling, setPolling] = useState<string | null>(null);
  const [testing, setTesting] = useState<Provider | null>(null);
  const [tests, setTests] = useState<Record<string, TestResult>>({});

  const runTest = async (provider: Provider) => {
    setTesting(provider);
    try {
      const r = (await testConnection({ data: { workspaceId: workspaceId!, provider } })) as TestResult;
      setTests((prev) => ({ ...prev, [provider]: r }));
      if (r.ok) toast.success(`${PROVIDER_LABEL[provider]}: conexão válida (${r.totalMs} ms)`);
      else toast.error(`${PROVIDER_LABEL[provider]}: ${r.error ?? "falha na verificação"}`);
      connections.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao testar conexão");
    } finally {
      setTesting(null);
    }
  };

  const opportunities = useQuery({
    queryKey: ["opportunities-for-meeting", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opportunities")
        .select("id, title, status")
        .eq("company_id", company!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const providerFor = (p: Platform) => PLATFORMS.find((x) => x.value === p)!.provider;
  const conn = (connections.data ?? []).find((c) => c.provider === providerFor(platform));

  const connect = async (provider: Provider) => {
    try {
      const { url } = await startOAuth({ data: { workspaceId: workspaceId!, provider } });
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao iniciar conexão");
    }
  };

  const save = async () => {
    if (!company) return toast.error("Selecione a conta (empresa)");
    if (!link.trim()) return toast.error("Informe o link da reunião");
    setSaving(true);
    try {
      await createMeeting({
        data: {
          workspaceId: workspaceId!,
          companyId: company.id,
          opportunityId: opportunityId === "none" ? null : opportunityId,
          platform,
          meetingLink: link.trim(),
          scheduledAt: when ? new Date(when).toISOString() : null,
        },
      });
      toast.success("Reunião agendada");
      setOpen(false);
      setCompany(null); setOpportunityId("none"); setLink(""); setWhen("");
      qc.invalidateQueries({ queryKey: ["meetings", workspaceId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao agendar");
    } finally {
      setSaving(false);
    }
  };

  const poll = async (id: string) => {
    setPolling(id);
    try {
      const r = await fetchMeetingTranscriptResult(id);
      if (r.ready) toast.success("Transcrição capturada");
      else toast.info("Transcrição ainda não disponível na plataforma");
      qc.invalidateQueries({ queryKey: ["meetings", workspaceId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao buscar transcrição");
    } finally {
      setPolling(null);
    }
  };

  const fetchMeetingTranscriptResult = async (id: string) => {
    const r = await fetchNow({ data: { workspaceId: workspaceId!, meetingId: id } });
    return { ready: r.ready > 0 };
  };

  if (!hasAddon) {
    return (
      <div className="p-6 md:p-8 max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Captura Nativa de Reuniões</CardTitle>
            <CardDescription>
              Add-on Enterprise. Fale com o administrador do workspace para habilitar a captura
              automática de transcrições do Teams, Zoom e Google Meet.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Reuniões Remotas</h1>
          <p className="text-muted-foreground mt-1">
            Agende a reunião e o NSB Flow busca a transcrição automaticamente quando ela ficar pronta.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1.5" /> Nova reunião</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-display">Nova reunião</DialogTitle>
              <DialogDescription>
                Vincule a reunião a uma conta e cole o link do convite.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Conta (empresa)</Label>
                <CompanyPicker value={company?.id ?? null} onChange={setCompany} />
              </div>
              <div className="space-y-1.5">
                <Label>Oportunidade <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <Select value={opportunityId} onValueChange={setOpportunityId} disabled={!company}>
                  <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {(opportunities.data ?? []).map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Plataforma</Label>
                <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {conn && !conn.connected && (
                <div className="rounded-md border border-gold/40 bg-gold/10 p-3 space-y-2">
                  <p className="text-xs">
                    Conecte sua conta {PROVIDER_LABEL[conn.provider as Provider]} para que a
                    transcrição possa ser buscada em seu nome.
                  </p>
                  <Button size="sm" variant="outline" onClick={() => connect(conn.provider as Provider)}>
                    <Plug className="h-3.5 w-3.5 mr-1.5" /> Conectar {PROVIDER_LABEL[conn.provider as Provider]}
                  </Button>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Link da reunião</Label>
                <Input placeholder="https://..." value={link} onChange={(e) => setLink(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Data/hora prevista</Label>
                <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={save} disabled={saving || !conn?.connected}>
                {saving ? "Salvando..." : "Agendar reunião"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Plug className="h-4 w-4 text-gold" /> Minhas contas conectadas
          </CardTitle>
          <CardDescription>
            A conexão é individual: cada vendedor conecta a própria conta, já que a agenda de
            reuniões pertence ao usuário.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {connections.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : (
            (connections.data ?? []).map((c) => {
              const t = tests[c.provider];
              const needsReauth =
                !!c.credentialsConfigured &&
                (c.tokenExpired ||
                  !!c.lastError ||
                  (!!t && !t.ok) ||
                  (!!c.email && !c.connected));
              return (
              <div key={c.provider} className="space-y-2 border-b border-border/60 pb-3 last:border-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium flex items-center gap-2">
                    {PROVIDER_LABEL[c.provider as Provider]}
                    {needsReauth && (
                      <Badge variant="destructive" className="text-[10px]">
                        {c.tokenExpired ? "Token expirado" : "Reautorização necessária"}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {c.connected
                      ? `${c.email ?? "conta conectada"}${c.connectedAt ? ` · desde ${format(new Date(c.connectedAt), "dd/MM/yyyy", { locale: ptBR })}` : ""}`
                      : c.credentialsConfigured
                        ? "Não conectada"
                        : "Credenciais do app não configuradas no projeto"}
                  </div>
                  {needsReauth && (c.lastError || (t && !t.ok && t.error)) && (
                    <div className="text-xs text-destructive truncate">
                      {c.lastError ?? t?.error}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!c.connected || testing === c.provider}
                    onClick={() => runTest(c.provider as Provider)}
                  >
                    {testing === c.provider ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Testar conexão
                  </Button>
                  {needsReauth && (
                    <Button size="sm" onClick={() => connect(c.provider as Provider)}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Reautorizar
                    </Button>
                  )}
                  {c.connected ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await disconnect({ data: { workspaceId: workspaceId!, provider: c.provider as Provider } });
                        toast.success("Conta desconectada");
                        setTests((prev) => {
                          const next = { ...prev };
                          delete next[c.provider];
                          return next;
                        });
                        connections.refetch();
                      }}
                    >
                      <Unplug className="h-3.5 w-3.5 mr-1.5" /> Desconectar
                    </Button>
                  ) : (
                    !needsReauth && (
                    <Button size="sm" variant="outline" disabled={!c.credentialsConfigured} onClick={() => connect(c.provider as Provider)}>
                      <Plug className="h-3.5 w-3.5 mr-1.5" /> Conectar
                    </Button>
                    )
                  )}
                </div>
                </div>
                {t && (
                  <div className="rounded-md border bg-muted/40 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium">
                      {t.ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-destructive" />
                      )}
                      {t.ok ? "Conexão válida" : "Falha na verificação"}
                      <span className="text-muted-foreground font-normal">
                        · {t.totalMs} ms{t.email ? ` · ${t.email}` : ""}
                      </span>
                    </div>
                    {t.checks.length > 0 && (
                      <ul className="space-y-1">
                        {t.checks.map((chk) => (
                          <li key={chk.scope} className="flex flex-wrap items-center gap-2 text-xs">
                            {chk.ok ? (
                              <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                            ) : (
                              <XCircle className="h-3 w-3 text-destructive shrink-0" />
                            )}
                            <span>{chk.label}</span>
                            <code className="rounded bg-background px-1 py-0.5 text-[10px] text-muted-foreground">
                              {chk.scope}
                            </code>
                            <span className="text-muted-foreground">
                              {chk.status ?? "—"} · {chk.ms} ms
                            </span>
                            {!chk.ok && chk.detail && (
                              <span className="text-destructive truncate max-w-xs">{chk.detail}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {!t.ok && t.checks.length === 0 && t.error && (
                      <p className="text-xs text-destructive">{t.error}</p>
                    )}
                  </div>
                )}
              </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Video className="h-4 w-4 text-gold" /> Reuniões agendadas
          </CardTitle>
          <CardDescription>Status da captura de transcrição de cada reunião.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {meetings.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : (meetings.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma reunião agendada ainda.</p>
          ) : (
            (meetings.data ?? []).map((m) => {
              const st = STATUS[m.status] ?? STATUS.scheduled;
              const companyName = Array.isArray(m.companies)
                ? m.companies[0]?.razao_social
                : m.companies?.razao_social;
              return (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-sm font-medium truncate">{companyName ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {PLATFORMS.find((p) => p.value === m.platform)?.label ?? m.platform}
                      {m.scheduled_at
                        ? ` · ${format(new Date(m.scheduled_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}`
                        : ""}
                    </div>
                    {m.last_error && m.status !== "transcript_ready" && (
                      <div className="text-xs text-destructive truncate max-w-md">{m.last_error}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={st.variant}>{st.label}</Badge>
                    {m.status === "transcript_ready" ? (
                      <Button size="sm" variant="outline" onClick={() => setTranscript(m)}>
                        <FileText className="h-3.5 w-3.5 mr-1.5" /> Ver transcrição
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" disabled={polling === m.id} onClick={() => poll(m.id)}>
                        {polling === m.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        <span className="ml-1.5">Buscar agora</span>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Dialog open={!!transcript} onOpenChange={(v) => !v && setTranscript(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Transcrição</DialogTitle>
            <DialogDescription>
              {transcript?.transcript_fetched_at
                ? `Capturada em ${format(new Date(transcript.transcript_fetched_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}`
                : "Texto bruto da plataforma."}
            </DialogDescription>
          </DialogHeader>
          <Textarea readOnly value={transcript?.transcript_text ?? ""} className="h-80 font-mono text-xs" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
