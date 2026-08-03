import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { useEntitlements, canUseRemoteMeetingCapture } from "@/lib/entitlements";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Plug, RefreshCw, Unplug, ShieldCheck, CheckCircle2, XCircle } from "lucide-react";
import {
  getMeetingConnectionsFn, startMeetingOAuthFn, disconnectMeetingProviderFn, testMeetingConnectionFn,
} from "@/lib/meetings.functions";

export const Route = createFileRoute("/_authenticated/app/reunioes")({
  head: () => ({
    meta: [
      { title: "Integrações de Reunião — NSB Flow" },
      { name: "description", content: "Conecte Microsoft 365, Zoom ou Google Workspace para capturar automaticamente a transcrição das suas reuniões remotas no NSB Flow." },
      { property: "og:title", content: "Integrações de Reunião — NSB Flow" },
      { property: "og:description", content: "Conexões de Teams, Zoom e Google Meet para captura de transcrição." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MeetingIntegrationsPage,
});

type Provider = "microsoft" | "zoom" | "google";

const PROVIDER_LABEL: Record<Provider, string> = {
  microsoft: "Microsoft 365",
  zoom: "Zoom",
  google: "Google Workspace",
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

function MeetingIntegrationsPage() {
  const { workspaceId } = useWorkspace();
  const { roles } = useAuth();
  const ent = useEntitlements();
  const getConnections = useServerFn(getMeetingConnectionsFn);
  const startOAuth = useServerFn(startMeetingOAuthFn);
  const disconnect = useServerFn(disconnectMeetingProviderFn);
  const testConnection = useServerFn(testMeetingConnectionFn);

  const allowed = !ent.loading && canUseRemoteMeetingCapture(ent, roles);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("conn") === "connected") toast.success("Conta conectada com sucesso");
    if (p.get("conn") === "error") toast.error(p.get("message") ?? "Falha ao conectar");
    if (p.get("conn")) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const connections = useQuery({
    queryKey: ["meeting-connections", workspaceId],
    enabled: !!workspaceId && allowed,
    queryFn: () => getConnections({ data: { workspaceId: workspaceId! } }),
  });

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

  const connect = async (provider: Provider) => {
    try {
      const { url } = await startOAuth({ data: { workspaceId: workspaceId!, provider } });
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao iniciar conexão");
    }
  };

  if (ent.loading) {
    return (
      <div className="p-6 md:p-8 max-w-3xl mx-auto flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="p-6 md:p-8 max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Integrações de Reunião</CardTitle>
            <CardDescription>
              A captura automática de transcrição de reuniões remotas (Teams, Zoom e Google Meet)
              está disponível nos planos Pro e Enterprise. Faça upgrade para habilitar.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Integrações de Reunião</h1>
        <p className="text-muted-foreground mt-1">
          Conecte as plataformas que você usa. Depois, no Deap Intelligence AI, escolha
          “Reunião Remota” para que a transcrição seja capturada automaticamente.
        </p>
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
                <div className="flex flex-wrap items-center justify-between gap-3">
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
    </div>
  );
}
