import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useAuth } from "@/lib/auth-context";
import { ROLE_LABELS } from "@/lib/roles";
import { supabase } from "@/integrations/supabase/client";
import { getWebhookUrlFn, saveWebhookUrlFn } from "@/lib/agent-service.functions";
import { useAlertPrefs } from "@/lib/alert-prefs";
import { toast } from "sonner";
import { Loader2, ShieldCheck, BellRing } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — NSB Flow" }] }),
  component: Config,
});

function Config() {
  const { user, roles, fullName, sector, refresh } = useAuth();
  const { prefs, update: updatePrefs, reset: resetPrefs } = useAlertPrefs(user?.id);
  const getUrl = useServerFn(getWebhookUrlFn);
  const saveUrl = useServerFn(saveWebhookUrlFn);
  const [name, setName] = useState(fullName ?? "");
  const [sectorInput, setSectorInput] = useState(sector ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [webhook, setWebhook] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingWebhook, setLoadingWebhook] = useState(true);
  const [savingWebhook, setSavingWebhook] = useState(false);

  useEffect(() => { setName(fullName ?? ""); }, [fullName]);
  useEffect(() => { setSectorInput(sector ?? ""); }, [sector]);

  useEffect(() => {
    getUrl()
      .then((r) => {
        setIsAdmin(r.isAdmin);
        setWebhook(r.url);
      })
      .catch(() => void 0)
      .finally(() => setLoadingWebhook(false));
  }, [getUrl]);

  const saveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: name, sector: sectorInput.trim() || null })
      .eq("id", user.id);
    setSavingProfile(false);
    if (error) return toast.error(error.message);
    toast.success("Perfil atualizado");
    refresh();
  };

  const saveWebhook = async () => {
    setSavingWebhook(true);
    try {
      await saveUrl({ data: { url: webhook } });
      toast.success("Webhook salvo");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSavingWebhook(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Configurações</h1>
        <p className="text-muted-foreground mt-1">Perfil, preferências e integrações.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">Perfil</CardTitle>
          <CardDescription>Suas informações pessoais e perfis de acesso.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>E-mail</Label>
            <Input value={user?.email ?? ""} disabled />
          </div>
          <div className="space-y-1.5">
            <Label>Nome completo</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Setor</Label>
            <Input
              value={sectorInput}
              onChange={(e) => setSectorInput(e.target.value)}
              placeholder="Ex.: Corporate, Enterprise, SMB, Public"
            />
            <p className="text-xs text-muted-foreground">
              Usado automaticamente nos formulários dos agentes DEAP.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Perfis</Label>
            <div className="flex flex-wrap gap-1.5">
              {roles.length === 0 ? (
                <Badge variant="outline">Sem perfil atribuído</Badge>
              ) : (
                roles.map((r) => <Badge key={r}>{ROLE_LABELS[r]}</Badge>)
              )}
            </div>
          </div>
          <Button onClick={saveProfile} disabled={savingProfile}>
            {savingProfile ? "Salvando..." : "Salvar perfil"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <BellRing className="h-4 w-4 text-gold" /> Alertas in-app
          </CardTitle>
          <CardDescription>
            Ajuste os limiares de aviso de saldo de créditos e escolha se quer receber notificações no aplicativo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-sm">Receber avisos in-app</Label>
              <p className="text-xs text-muted-foreground">
                Toasts e notificações para saldo baixo, créditos esgotados e trial próximo do fim.
              </p>
            </div>
            <Switch
              checked={prefs.enabled}
              onCheckedChange={(v) => updatePrefs({ enabled: v })}
            />
          </div>

          <div className="flex items-start justify-between gap-4 border-t border-border/60 pt-4">
            <div className="space-y-0.5">
              <Label className="text-sm">Também enviar por e-mail</Label>
              <p className="text-xs text-muted-foreground">
                Recebe os mesmos avisos de saldo baixo, créditos esgotados e trial expirando em <strong>{user?.email}</strong>.
                Requer um domínio de e-mail verificado no projeto.
              </p>
            </div>
            <Switch
              checked={prefs.emailEnabled}
              disabled={!prefs.enabled}
              onCheckedChange={(v) => updatePrefs({ emailEnabled: v })}
            />
          </div>

          <div className={prefs.enabled ? "space-y-6" : "space-y-6 opacity-50 pointer-events-none"}>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Alerta amarelo (saldo baixo)</Label>
                <span className="text-sm font-medium tabular-nums">{prefs.warnPct}%</span>
              </div>
              <Slider
                min={5}
                max={50}
                step={5}
                value={[prefs.warnPct]}
                onValueChange={([v]) =>
                  updatePrefs({
                    warnPct: v,
                    criticalPct: Math.min(prefs.criticalPct, v - 5),
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Dispara quando o saldo restante fica igual ou abaixo deste percentual da cota mensal.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Alerta crítico</Label>
                <span className="text-sm font-medium tabular-nums">{prefs.criticalPct}%</span>
              </div>
              <Slider
                min={1}
                max={Math.max(1, prefs.warnPct - 5)}
                step={1}
                value={[prefs.criticalPct]}
                onValueChange={([v]) => updatePrefs({ criticalPct: v })}
              />
              <p className="text-xs text-muted-foreground">
                Notificação de alta severidade. Deve ser menor que o alerta amarelo.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Aviso do trial (dias antes)</Label>
                <span className="text-sm font-medium tabular-nums">{prefs.trialWarnDays} dia(s)</span>
              </div>
              <Slider
                min={1}
                max={7}
                step={1}
                value={[prefs.trialWarnDays]}
                onValueChange={([v]) => updatePrefs({ trialWarnDays: v })}
              />
              <p className="text-xs text-muted-foreground">
                Aviso disparado com esta antecedência. Nas últimas 24h o alerta vira crítico automaticamente.
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={resetPrefs}>
              Restaurar padrões
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>

        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-gold" /> Integração n8n (Agent Service)
          </CardTitle>
          <CardDescription>
            URL do webhook que executa os agentes de IA. {isAdmin ? "Somente administradores editam." : "Apenas administradores podem editar esta configuração."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingWebhook ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : !isAdmin ? (
            <p className="text-sm text-muted-foreground">
              Peça a um administrador para configurar o webhook do n8n.
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>URL do webhook</Label>
                <Input
                  placeholder="https://seu-n8n.exemplo.com/webhook/nsbflow"
                  value={webhook}
                  onChange={(e) => setWebhook(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  A plataforma enviará POST com <code>{"{ agent, runId, payload }"}</code> e aguardará o JSON de resposta.
                </p>
              </div>
              <Button onClick={saveWebhook} disabled={savingWebhook}>
                {savingWebhook ? "Salvando..." : "Salvar webhook"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
