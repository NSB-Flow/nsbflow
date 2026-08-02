import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Shield, Package, Search, Plus, Trash2, Layers, CheckCircle2, XCircle, History, Key, Palette, PlugZap } from "lucide-react";
import { ApiKeysPanel } from "@/components/admin/ApiKeysPanel";
import { WhiteLabelPanel } from "@/components/admin/WhiteLabelPanel";
import { CrmIntegrationPanel } from "@/components/admin/CrmIntegrationPanel";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/app/admin-modules")({
  head: () => ({ meta: [{ title: "Módulos Enterprise — NSB Flow" }] }),
  component: AdminModulesPage,
});

const KNOWN_MODULES: { key: string; label: string; description: string }[] = [
  { key: "meeting_recording", label: "Gravação de Reunião", description: "Habilita o botão 'Iniciar Reunião' no Deap Intelligence, com captura de áudio direto pelo navegador e upload automático para análise." },
  { key: "native_meeting_capture", label: "Captura Nativa de Reuniões", description: "Conecta a conta Microsoft 365, Zoom ou Google Workspace de cada vendedor e captura automaticamente a transcrição das reuniões remotas agendadas." },
  { key: "deap.meeting.briefing", label: "Deap Briefing AI", description: "Acesso ao agente de briefing pré-reunião." },
  { key: "deap.meeting.intelligence", label: "Deap Intelligence AI", description: "Acesso ao agente de análise pós-reunião." },
  { key: "deap.assessment.sales", label: "Sales Development AI", description: "Assessment de desenvolvimento comercial." },
  { key: "deap.assessment.leadership", label: "Leadership AI", description: "Assessment de liderança." },
  { key: "deap.assessment.process", label: "Process & Execution AI", description: "Assessment de processos e execução." },
  { key: "deap.assessment.executive", label: "Executive Intelligence AI", description: "Assessment executivo." },
  { key: "dashboard.executive", label: "Dashboard Executivo", description: "Painel executivo consolidado." },
  { key: "whatsapp_integration", label: "WhatsApp Cloud API", description: "Integração oficial com WhatsApp para atendimento via agentes DEAP, sem risco de banimento (alternativa à Evolution API usada em testes internos)." },
  { key: "report_white_label", label: "Relatórios White-Label", description: "Exportação de relatórios (PDF/Excel) com a marca do cliente em vez da marca NSB, para uso interno e apresentações executivas do cliente." },
  { key: "crm_integration", label: "Integração com CRM Externo", description: "Sincroniza oportunidades e contas bidirecionalmente com o CRM que o cliente já usa (Salesforce, HubSpot, Pipedrive). Remove a objeção de migração — o NSB Flow passa a ser uma camada de inteligência sobre o CRM existente, não um substituto." },
  { key: "sso_saml", label: "Login Corporativo (SSO/SAML)", description: "Permite login via provedor de identidade corporativo do cliente. Frequentemente exigido por política de segurança em empresas grandes — pode ser bloqueador de compra, não apenas bônus." },
  { key: "custom_domain", label: "Domínio White-Label", description: "Permite acessar a plataforma por um domínio próprio do cliente (ex: app.clientedoenterprise.com) em vez do domínio NSB Flow." },
  { key: "data_export_api", label: "API de Exportação de Dados", description: "Endpoint de leitura para o time de BI do cliente consumir os dados do NSB Flow em ferramentas próprias (Power BI, Looker, etc.)." },
];

function AdminModulesPage() {
  const { roles, loading } = useAuth();
  if (loading) return null;
  if (!roles.includes("super_admin")) return <Navigate to="/app" />;

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-gold/10 border border-gold/30 flex items-center justify-center">
          <Shield className="h-5 w-5 text-gold" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-gold font-medium">Painel do Proprietário</div>
          <h1 className="font-display text-3xl font-bold">Módulos Enterprise</h1>
          <p className="text-sm text-muted-foreground">
            Habilite ou desabilite add-ons por workspace sem precisar de SQL manual.
          </p>
        </div>
      </div>
      <Tabs
        defaultValue={
          typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "crm"
            ? "crm"
            : "individual"
        }
      >
        <TabsList>
          <TabsTrigger value="individual">Individual</TabsTrigger>
          <TabsTrigger value="bulk">
            <Layers className="h-3.5 w-3.5 mr-1.5" /> Em Lote
          </TabsTrigger>
          <TabsTrigger value="audit">
            <History className="h-3.5 w-3.5 mr-1.5" /> Auditoria
          </TabsTrigger>
          <TabsTrigger value="api-keys">
            <Key className="h-3.5 w-3.5 mr-1.5" /> Chaves de API
          </TabsTrigger>
          <TabsTrigger value="white-label">
            <Palette className="h-3.5 w-3.5 mr-1.5" /> White-Label
          </TabsTrigger>
          <TabsTrigger value="crm">
            <PlugZap className="h-3.5 w-3.5 mr-1.5" /> CRM
          </TabsTrigger>
        </TabsList>
        <TabsContent value="individual" className="mt-6">
          <ModulesManager />
        </TabsContent>
        <TabsContent value="bulk" className="mt-6">
          <BulkModulesPanel />
        </TabsContent>
        <TabsContent value="audit" className="mt-6">
          <ModuleGrantAuditPanel />
        </TabsContent>
        <TabsContent value="api-keys" className="mt-6">
          <ApiKeysPanel />
        </TabsContent>
        <TabsContent value="white-label" className="mt-6">
          <WhiteLabelPanel />
        </TabsContent>
        <TabsContent value="crm" className="mt-6">
          <CrmIntegrationPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  is_personal: boolean;
  subscription_id: string | null;
  plan_tier: string | null;
  plan_name: string | null;
}

function ModulesManager() {
  const [search, setSearch] = useState("");
  const [selectedWs, setSelectedWs] = useState<WorkspaceRow | null>(null);

  const { data: workspaces = [], isLoading } = useQuery({
    queryKey: ["admin-workspaces-with-subs"],
    queryFn: async (): Promise<WorkspaceRow[]> => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, name, slug, is_personal, subscriptions(id, plans(tier, name))")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((w: any) => {
        const sub = Array.isArray(w.subscriptions) ? w.subscriptions[0] : w.subscriptions;
        const plan = sub ? (Array.isArray(sub.plans) ? sub.plans[0] : sub.plans) : null;
        return {
          id: w.id,
          name: w.name,
          slug: w.slug,
          is_personal: w.is_personal,
          subscription_id: sub?.id ?? null,
          plan_tier: plan?.tier ?? null,
          plan_name: plan?.name ?? null,
        };
      });
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workspaces;
    return workspaces.filter((w) => w.name.toLowerCase().includes(q) || w.slug.toLowerCase().includes(q));
  }, [workspaces, search]);

  return (
    <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" /> Workspaces
          </CardTitle>
          <div className="relative mt-2">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou slug…"
              className="pl-8 h-9"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Carregando…</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Nenhum workspace encontrado.</div>
          ) : (
            <div className="max-h-[560px] overflow-y-auto divide-y">
              {filtered.map((w) => (
                <button
                  key={w.id}
                  onClick={() => setSelectedWs(w)}
                  className={`w-full text-left px-4 py-2.5 hover:bg-muted/50 transition-colors ${
                    selectedWs?.id === w.id ? "bg-muted/70" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{w.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{w.slug}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {w.plan_tier && (
                        <Badge variant="outline" className="text-[9px] uppercase h-4 px-1">
                          {w.plan_tier}
                        </Badge>
                      )}
                      {w.is_personal && <span className="text-[9px] text-muted-foreground">PF</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        {selectedWs ? (
          <GrantsPanel ws={selectedWs} />
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Selecione um workspace para gerenciar seus módulos.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

interface Grant {
  id: string;
  feature_key: string;
  enabled: boolean;
  created_at: string;
}

function GrantsPanel({ ws }: { ws: WorkspaceRow }) {
  const qc = useQueryClient();
  const [addKey, setAddKey] = useState<string>("meeting_recording");
  const [customKey, setCustomKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: grants = [], isLoading, refetch } = useQuery({
    queryKey: ["emg-grants", ws.subscription_id],
    enabled: !!ws.subscription_id,
    queryFn: async (): Promise<Grant[]> => {
      const { data, error } = await supabase
        .from("enterprise_module_grants")
        .select("id, feature_key, enabled, created_at")
        .eq("subscription_id", ws.subscription_id!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const refresh = async () => {
    await refetch();
    qc.invalidateQueries({ queryKey: ["entitlements"] });
  };

  if (!ws.subscription_id) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{ws.name}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Este workspace não possui uma assinatura ativa. Crie uma assinatura antes de habilitar módulos.
        </CardContent>
      </Card>
    );
  }

  const byKey = new Map(grants.map((g) => [g.feature_key, g]));

  const toggleGrant = async (feature_key: string, enabled: boolean) => {
    setBusy(feature_key);
    try {
      const existing = byKey.get(feature_key);
      if (existing) {
        const { error } = await supabase
          .from("enterprise_module_grants")
          .update({ enabled })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("enterprise_module_grants")
          .insert({ subscription_id: ws.subscription_id!, feature_key, enabled });
        if (error) throw error;
      }
      await refresh();
      toast.success(`Módulo ${enabled ? "habilitado" : "desabilitado"}: ${feature_key}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao atualizar módulo.");
    } finally {
      setBusy(null);
    }
  };

  const removeGrant = async (id: string, feature_key: string) => {
    setBusy(feature_key);
    try {
      const { error } = await supabase.from("enterprise_module_grants").delete().eq("id", id);
      if (error) throw error;
      await refresh();
      toast.success(`Grant removido: ${feature_key}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao remover grant.");
    } finally {
      setBusy(null);
    }
  };

  const addModule = async () => {
    const key = (addKey === "__custom__" ? customKey : addKey).trim();
    if (!key) return toast.error("Informe uma chave de módulo.");
    if (byKey.has(key)) return toast.error("Este módulo já existe para o workspace.");
    await toggleGrant(key, true);
    setCustomKey("");
    setAddKey("meeting_recording");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{ws.name}</CardTitle>
            <div className="text-xs text-muted-foreground mt-0.5">
              {ws.plan_name ?? "Sem plano"}{ws.plan_tier && ` · ${ws.plan_tier}`}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Módulos disponíveis</Label>
          <Table className="mt-2">
            <TableHeader>
              <TableRow>
                <TableHead>Módulo</TableHead>
                <TableHead className="w-24 text-center">Status</TableHead>
                <TableHead className="w-24 text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {KNOWN_MODULES.map((m) => {
                const g = byKey.get(m.key);
                const isEnabled = !!g?.enabled;
                return (
                  <TableRow key={m.key}>
                    <TableCell>
                      <div className="font-medium text-sm">{m.label}</div>
                      <div className="text-[11px] text-muted-foreground">{m.description}</div>
                      <code className="text-[10px] text-muted-foreground">{m.key}</code>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={isEnabled}
                        disabled={busy === m.key}
                        onCheckedChange={(v) => toggleGrant(m.key, v)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      {g && (
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={busy === m.key}
                          onClick={() => removeGrant(g.id, m.key)}
                          title="Remover registro"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {isLoading ? null : (
          <>
            {grants.some((g) => !KNOWN_MODULES.find((m) => m.key === g.feature_key)) && (
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Grants customizados</Label>
                <Table className="mt-2">
                  <TableBody>
                    {grants
                      .filter((g) => !KNOWN_MODULES.find((m) => m.key === g.feature_key))
                      .map((g) => (
                        <TableRow key={g.id}>
                          <TableCell>
                            <code className="text-xs">{g.feature_key}</code>
                          </TableCell>
                          <TableCell className="w-24 text-center">
                            <Switch
                              checked={g.enabled}
                              disabled={busy === g.feature_key}
                              onCheckedChange={(v) => toggleGrant(g.feature_key, v)}
                            />
                          </TableCell>
                          <TableCell className="w-24 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={busy === g.feature_key}
                              onClick={() => removeGrant(g.id, g.feature_key)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}

        <div className="border-t pt-4">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Adicionar módulo</Label>
          <div className="flex gap-2 mt-2">
            <Select value={addKey} onValueChange={setAddKey}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KNOWN_MODULES.map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {m.label} <span className="text-muted-foreground">({m.key})</span>
                  </SelectItem>
                ))}
                <SelectItem value="__custom__">Chave customizada…</SelectItem>
              </SelectContent>
            </Select>
            {addKey === "__custom__" && (
              <Input
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value)}
                placeholder="feature_key"
                className="flex-1"
              />
            )}
            <Button onClick={addModule} disabled={busy !== null}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- Bulk actions ---------------- */

interface BulkWsRow {
  id: string;
  name: string;
  slug: string;
  is_personal: boolean;
  subscription_id: string | null;
  plan_tier: string | null;
  grant_id: string | null;
  grant_enabled: boolean | null;
}

function BulkModulesPanel() {
  const qc = useQueryClient();
  const [featureKey, setFeatureKey] = useState<string>("meeting_recording");
  const [customKey, setCustomKey] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled" | "none">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const effectiveKey = (featureKey === "__custom__" ? customKey : featureKey).trim();

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["bulk-workspaces", effectiveKey],
    enabled: !!effectiveKey,
    queryFn: async (): Promise<BulkWsRow[]> => {
      const { data: ws, error: wErr } = await supabase
        .from("workspaces")
        .select("id, name, slug, is_personal, subscriptions(id, plans(tier))")
        .order("name", { ascending: true });
      if (wErr) throw wErr;

      const subIds = (ws ?? [])
        .map((w: any) => {
          const s = Array.isArray(w.subscriptions) ? w.subscriptions[0] : w.subscriptions;
          return s?.id as string | undefined;
        })
        .filter((x): x is string => !!x);

      let grantsBySub = new Map<string, { id: string; enabled: boolean }>();
      if (subIds.length) {
        const { data: grants, error: gErr } = await supabase
          .from("enterprise_module_grants")
          .select("id, subscription_id, enabled")
          .eq("feature_key", effectiveKey)
          .in("subscription_id", subIds);
        if (gErr) throw gErr;
        grantsBySub = new Map((grants ?? []).map((g: any) => [g.subscription_id, { id: g.id, enabled: g.enabled }]));
      }

      return (ws ?? []).map((w: any) => {
        const s = Array.isArray(w.subscriptions) ? w.subscriptions[0] : w.subscriptions;
        const plan = s ? (Array.isArray(s.plans) ? s.plans[0] : s.plans) : null;
        const g = s?.id ? grantsBySub.get(s.id) : undefined;
        return {
          id: w.id,
          name: w.name,
          slug: w.slug,
          is_personal: w.is_personal,
          subscription_id: s?.id ?? null,
          plan_tier: plan?.tier ?? null,
          grant_id: g?.id ?? null,
          grant_enabled: g ? g.enabled : null,
        };
      });
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !r.slug.toLowerCase().includes(q)) return false;
      if (statusFilter === "enabled" && r.grant_enabled !== true) return false;
      if (statusFilter === "disabled" && r.grant_enabled !== false) return false;
      if (statusFilter === "none" && r.grant_id !== null) return false;
      return true;
    });
  }, [rows, search, statusFilter]);

  const selectableIds = filtered.filter((r) => r.subscription_id).map((r) => r.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const someSelected = selectableIds.some((id) => selected.has(id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        selectableIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        selectableIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const refresh = async () => {
    await refetch();
    qc.invalidateQueries({ queryKey: ["entitlements"] });
    qc.invalidateQueries({ queryKey: ["emg-grants"] });
  };

  const applyBulk = async (action: "enable" | "disable" | "remove") => {
    if (!effectiveKey) return toast.error("Informe uma chave de módulo.");
    const targets = rows.filter((r) => selected.has(r.id) && r.subscription_id);
    if (targets.length === 0) return toast.error("Selecione ao menos um workspace com assinatura.");

    setBusy(true);
    let ok = 0;
    let fail = 0;

    try {
      if (action === "remove") {
        const ids = targets.map((t) => t.grant_id).filter((x): x is string => !!x);
        if (ids.length) {
          const { error } = await supabase.from("enterprise_module_grants").delete().in("id", ids);
          if (error) throw error;
          ok = ids.length;
        }
      } else {
        const enabled = action === "enable";
        // Update existing grants
        const withGrant = targets.filter((t) => t.grant_id);
        const withoutGrant = targets.filter((t) => !t.grant_id);
        if (withGrant.length) {
          const { error } = await supabase
            .from("enterprise_module_grants")
            .update({ enabled })
            .in(
              "id",
              withGrant.map((t) => t.grant_id!),
            );
          if (error) throw error;
          ok += withGrant.length;
        }
        if (withoutGrant.length) {
          const payload = withoutGrant.map((t) => ({
            subscription_id: t.subscription_id!,
            feature_key: effectiveKey,
            enabled,
          }));
          const { error } = await supabase.from("enterprise_module_grants").insert(payload);
          if (error) throw error;
          ok += withoutGrant.length;
        }
      }

      toast.success(
        `${ok} workspace(s) atualizado(s)${fail ? ` · ${fail} falha(s)` : ""} · ${effectiveKey}`,
      );
      setSelected(new Set());
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao aplicar ação em lote.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4" /> Ações em lote
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Habilite, desabilite ou remova um módulo em vários workspaces de uma vez.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Módulo</Label>
            <Select value={featureKey} onValueChange={setFeatureKey}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {KNOWN_MODULES.map((m) => (
                  <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                ))}
                <SelectItem value="__custom__">Chave customizada…</SelectItem>
              </SelectContent>
            </Select>
            {featureKey === "__custom__" && (
              <Input
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value)}
                placeholder="feature_key"
                className="mt-2"
              />
            )}
            {featureKey !== "__custom__" && (
              <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
                {KNOWN_MODULES.find((m) => m.key === featureKey)?.description}
              </p>
            )}
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Buscar</Label>
            <div className="relative mt-1">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome ou slug…"
                className="pl-8"
              />
            </div>
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Status atual</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="enabled">Habilitados</SelectItem>
                <SelectItem value="disabled">Desabilitados</SelectItem>
                <SelectItem value="none">Sem grant</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border rounded-md p-2.5 bg-muted/30">
          <div className="text-xs text-muted-foreground mr-auto">
            {selected.size} selecionado(s) · {filtered.length} visível(is)
          </div>
          <Button size="sm" variant="outline" onClick={() => setSelected(new Set())} disabled={selected.size === 0 || busy}>
            Limpar
          </Button>
          <Button size="sm" variant="default" onClick={() => applyBulk("enable")} disabled={selected.size === 0 || busy}>
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Habilitar
          </Button>
          <Button size="sm" variant="secondary" onClick={() => applyBulk("disable")} disabled={selected.size === 0 || busy}>
            <XCircle className="h-3.5 w-3.5 mr-1.5" /> Desabilitar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => applyBulk("remove")} disabled={selected.size === 0 || busy}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remover
          </Button>
        </div>

        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={toggleAll}
                    aria-label="Selecionar todos"
                  />
                </TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead className="w-24">Plano</TableHead>
                <TableHead className="w-32 text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">Carregando…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">Nenhum workspace.</TableCell></TableRow>
              ) : (
                filtered.map((r) => {
                  const disabled = !r.subscription_id;
                  return (
                    <TableRow key={r.id} className={disabled ? "opacity-60" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(r.id)}
                          onCheckedChange={() => toggleOne(r.id)}
                          disabled={disabled}
                          aria-label={`Selecionar ${r.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium truncate">{r.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {r.slug} {r.is_personal && "· PF"}
                          {disabled && " · sem assinatura"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {r.plan_tier ? (
                          <Badge variant="outline" className="text-[9px] uppercase h-4 px-1">{r.plan_tier}</Badge>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {r.grant_id === null ? (
                          <span className="text-[11px] text-muted-foreground">sem grant</span>
                        ) : r.grant_enabled ? (
                          <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px]">habilitado</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">desabilitado</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// AUDIT PANEL
// ============================================================

interface AuditRow {
  id: string;
  subscription_id: string | null;
  workspace_id: string | null;
  feature_key: string;
  action: string;
  old_enabled: boolean | null;
  new_enabled: boolean | null;
  actor_user_id: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

const ACTION_META: Record<string, { label: string; className: string }> = {
  created: { label: "Criado", className: "bg-sky-500/15 text-sky-600 border-sky-500/30" },
  enabled: { label: "Habilitado", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  disabled: { label: "Desabilitado", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  updated: { label: "Atualizado", className: "bg-muted text-muted-foreground border-border" },
  removed: { label: "Removido", className: "bg-rose-500/15 text-rose-600 border-rose-500/30" },
};

function ModuleGrantAuditPanel() {
  const [featureFilter, setFeatureFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [days, setDays] = useState<string>("30");

  const { data, isLoading } = useQuery({
    queryKey: ["module-grant-audit", featureFilter, actionFilter, days],
    queryFn: async () => {
      let q = supabase
        .from("module_grant_audit")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (featureFilter !== "all") q = q.eq("feature_key", featureFilter);
      if (actionFilter !== "all") q = q.eq("action", actionFilter);
      if (days !== "all") {
        const since = new Date(Date.now() - Number(days) * 86400_000).toISOString();
        q = q.gte("created_at", since);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  const workspaceIds = useMemo(() => Array.from(new Set((data ?? []).map(r => r.workspace_id).filter(Boolean))) as string[], [data]);
  const actorIds = useMemo(() => Array.from(new Set((data ?? []).map(r => r.actor_user_id).filter(Boolean))) as string[], [data]);

  const { data: workspaces } = useQuery({
    queryKey: ["audit-workspaces", workspaceIds],
    enabled: workspaceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("workspaces").select("id,name,slug").in("id", workspaceIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: actors } = useQuery({
    queryKey: ["audit-actors", actorIds],
    enabled: actorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id,full_name").in("id", actorIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const wsMap = useMemo(() => {
    const m = new Map<string, { name: string; slug: string }>();
    (workspaces ?? []).forEach((w: any) => m.set(w.id, { name: w.name, slug: w.slug }));
    return m;
  }, [workspaces]);
  const actorMap = useMemo(() => {
    const m = new Map<string, string>();
    (actors ?? []).forEach((a: any) => m.set(a.id, a.full_name || a.id));
    return m;
  }, [actors]);

  const filtered = useMemo(() => {
    const q = workspaceSearch.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter(r => {
      const ws = r.workspace_id ? wsMap.get(r.workspace_id) : null;
      return (
        (ws?.name.toLowerCase().includes(q) ?? false) ||
        (ws?.slug.toLowerCase().includes(q) ?? false) ||
        r.feature_key.toLowerCase().includes(q)
      );
    });
  }, [data, workspaceSearch, wsMap]);

  function exportCsv() {
    const rows = filtered.map(r => {
      const ws = r.workspace_id ? wsMap.get(r.workspace_id) : null;
      return {
        data: format(new Date(r.created_at), "yyyy-MM-dd HH:mm:ss"),
        acao: ACTION_META[r.action]?.label ?? r.action,
        modulo: r.feature_key,
        workspace: ws?.name ?? r.workspace_id ?? "",
        slug: ws?.slug ?? "",
        de: r.old_enabled === null ? "" : r.old_enabled ? "on" : "off",
        para: r.new_enabled === null ? "" : r.new_enabled ? "on" : "off",
        ator: r.actor_user_id ? (actorMap.get(r.actor_user_id) ?? r.actor_user_id) : "",
        ip: r.ip ?? "",
      };
    });
    const headers = Object.keys(rows[0] ?? { data: "" });
    const csv = [
      headers.join(","),
      ...rows.map(r => headers.map(h => `"${String((r as any)[h]).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `module-grant-audit-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-gold" /> Histórico de alterações
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Cada mudança em concessões de módulos (criação, habilitar, desabilitar, remover) é registrada aqui.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Módulo</Label>
            <Select value={featureFilter} onValueChange={setFeatureFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {KNOWN_MODULES.map(m => (
                  <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Ação</Label>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="created">Criado</SelectItem>
                <SelectItem value="enabled">Habilitado</SelectItem>
                <SelectItem value="disabled">Desabilitado</SelectItem>
                <SelectItem value="removed">Removido</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Período</Label>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Últimas 24h</SelectItem>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
                <SelectItem value="all">Tudo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Buscar workspace</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-7"
                placeholder="nome ou slug"
                value={workspaceSearch}
                onChange={e => setWorkspaceSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {isLoading ? "carregando..." : `${filtered.length} evento(s)`}
          </div>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
            Exportar CSV
          </Button>
        </div>

        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Módulo</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>De → Para</TableHead>
                <TableHead>Quem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Nenhum evento no período.</TableCell></TableRow>
              ) : (
                filtered.map(r => {
                  const ws = r.workspace_id ? wsMap.get(r.workspace_id) : null;
                  const meta = ACTION_META[r.action] ?? { label: r.action, className: "bg-muted text-muted-foreground border-border" };
                  const knownMod = KNOWN_MODULES.find(m => m.key === r.feature_key);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">
                        <div className="text-xs">{format(new Date(r.created_at), "dd/MM/yyyy HH:mm")}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${meta.className}`}>{meta.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-medium">{knownMod?.label ?? r.feature_key}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{r.feature_key}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">{ws?.name ?? "—"}</div>
                        {ws?.slug && <div className="text-[10px] text-muted-foreground font-mono">{ws.slug}</div>}
                      </TableCell>
                      <TableCell>
                        <span className="text-[11px] font-mono">
                          {r.old_enabled === null ? "∅" : r.old_enabled ? "on" : "off"}
                          {" → "}
                          {r.new_enabled === null ? "∅" : r.new_enabled ? "on" : "off"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          {r.actor_user_id ? (actorMap.get(r.actor_user_id) ?? "—") : "—"}
                        </div>
                        {r.ip && <div className="text-[10px] text-muted-foreground font-mono">{r.ip}</div>}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
