import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Plug, PlugZap, RefreshCw, Trash2, Plus } from "lucide-react";
import { useWorkspace } from "@/lib/workspace-context";
import {
  getCrmStatusFn,
  startCrmOAuthFn,
  disconnectCrmFn,
  listCrmMappingsFn,
  upsertCrmMappingFn,
  deleteCrmMappingFn,
  listCrmSyncLogFn,
  runCrmInboundSyncFn,
} from "@/lib/crm.functions";
import {
  CRM_OBJECT_FOR,
  NSB_FIELDS,
  NSB_OBJECT_LABELS,
  SALESFORCE_FIELDS,
  SYNC_DIRECTION_LABELS,
  type NsbObject,
  type SyncDirection,
} from "@/lib/crm/mappings";

const fmt = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  success: "default",
  conflict_resolved: "secondary",
  error: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  success: "Sucesso",
  conflict_resolved: "Conflito resolvido",
  error: "Erro",
};

export function CrmIntegrationPanel() {
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();
  const status = useServerFn(getCrmStatusFn);
  const startOAuth = useServerFn(startCrmOAuthFn);
  const disconnect = useServerFn(disconnectCrmFn);
  const listMappings = useServerFn(listCrmMappingsFn);
  const upsertMapping = useServerFn(upsertCrmMappingFn);
  const deleteMapping = useServerFn(deleteCrmMappingFn);
  const listLog = useServerFn(listCrmSyncLogFn);
  const runSync = useServerFn(runCrmInboundSyncFn);

  const [nsbObject, setNsbObject] = useState<NsbObject>("company");
  const [nsbField, setNsbField] = useState("");
  const [crmField, setCrmField] = useState("");
  const [direction, setDirection] = useState<SyncDirection>("both");

  // Surface the OAuth callback outcome once.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const crm = params.get("crm");
    if (!crm) return;
    if (crm === "connected") toast.success("Salesforce conectado com sucesso");
    else toast.error(params.get("message") || "Falha ao conectar o Salesforce");
    params.delete("crm");
    params.delete("message");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    qc.invalidateQueries({ queryKey: ["crm-status"] });
  }, [qc]);

  const statusQ = useQuery({
    queryKey: ["crm-status", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => status({ data: { workspaceId: workspaceId! } }),
    retry: false,
  });

  const connected = !!statusQ.data?.connected;

  const mappingsQ = useQuery({
    queryKey: ["crm-mappings", workspaceId],
    enabled: !!workspaceId && !statusQ.isError,
    queryFn: () => listMappings({ data: { workspaceId: workspaceId! } }),
  });

  const logQ = useQuery({
    queryKey: ["crm-sync-log", workspaceId],
    enabled: !!workspaceId && !statusQ.isError,
    queryFn: () => listLog({ data: { workspaceId: workspaceId!, limit: 50 } }),
  });

  const connectM = useMutation({
    mutationFn: async () => startOAuth({ data: { workspaceId: workspaceId! } }),
    onSuccess: (r) => {
      window.location.href = r.url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnectM = useMutation({
    mutationFn: async () => disconnect({ data: { workspaceId: workspaceId! } }),
    onSuccess: () => {
      toast.success("Salesforce desconectado");
      qc.invalidateQueries({ queryKey: ["crm-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const syncM = useMutation({
    mutationFn: async () => runSync({ data: { workspaceId: workspaceId! } }),
    onSuccess: (r) => {
      if ("ok" in r && r.ok) toast.success("Sincronização executada");
      else toast.error("Nada sincronizado — verifique a conexão");
      qc.invalidateQueries({ queryKey: ["crm-sync-log"] });
      qc.invalidateQueries({ queryKey: ["crm-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMappingM = useMutation({
    mutationFn: async () =>
      upsertMapping({
        data: {
          workspaceId: workspaceId!,
          nsbObject,
          nsbField,
          crmObject: CRM_OBJECT_FOR[nsbObject] as "Account" | "Opportunity",
          crmField,
          syncDirection: direction,
        },
      }),
    onSuccess: () => {
      toast.success("Mapeamento salvo");
      setNsbField("");
      setCrmField("");
      qc.invalidateQueries({ queryKey: ["crm-mappings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMappingM = useMutation({
    mutationFn: async (id: string) => deleteMapping({ data: { workspaceId: workspaceId!, id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-mappings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateDirectionM = useMutation({
    mutationFn: async (row: { nsb_object: string; nsb_field: string; crm_field: string; sync_direction: string }) =>
      upsertMapping({
        data: {
          workspaceId: workspaceId!,
          nsbObject: row.nsb_object as NsbObject,
          nsbField: row.nsb_field,
          crmObject: CRM_OBJECT_FOR[row.nsb_object as NsbObject] as "Account" | "Opportunity",
          crmField: row.crm_field,
          syncDirection: row.sync_direction as SyncDirection,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-mappings"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const availableNsbFields = useMemo(() => NSB_FIELDS[nsbObject], [nsbObject]);
  const availableCrmFields = SALESFORCE_FIELDS[CRM_OBJECT_FOR[nsbObject]] ?? [];

  if (statusQ.isError) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          {(statusQ.error as Error).message === "Forbidden"
            ? "Apenas administradores do workspace podem gerenciar a integração com CRM."
            : (statusQ.error as Error).message}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <PlugZap className="h-4 w-4 text-gold" /> Salesforce
          </CardTitle>
          <CardDescription>
            Sincronização bidirecional de contas e oportunidades. Saída em tempo real; entrada via
            verificação automática a cada 15 minutos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {statusQ.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant={connected ? "default" : "outline"}>
                  {connected ? "Conectado" : statusQ.data?.connection?.status === "error" ? "Erro" : "Desconectado"}
                </Badge>
                {statusQ.data?.connection?.instance_url && (
                  <span className="text-xs text-muted-foreground">
                    {statusQ.data.connection.instance_url}
                  </span>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Conectado em</p>
                  <p className="font-medium">{fmt(statusQ.data?.connection?.connected_at)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Última sincronização</p>
                  <p className="font-medium">{fmt(statusQ.data?.connection?.last_sync_at)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Provedor</p>
                  <p className="font-medium">Salesforce</p>
                </div>
              </div>

              {statusQ.data?.connection?.last_error && (
                <p className="text-xs text-destructive">{statusQ.data.connection.last_error}</p>
              )}

              {!statusQ.data?.credentialsConfigured && (
                <p className="text-xs text-muted-foreground">
                  As credenciais do aplicativo conectado da NSB ainda não foram configuradas no
                  ambiente. Fale com o time da plataforma antes de conectar.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                {connected ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => syncM.mutate()}
                      disabled={syncM.isPending}
                    >
                      {syncM.isPending ? (
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-1.5" />
                      )}
                      Sincronizar agora
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => disconnectM.mutate()}
                      disabled={disconnectM.isPending}
                    >
                      Desconectar
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() => connectM.mutate()}
                    disabled={connectM.isPending || !statusQ.data?.credentialsConfigured}
                  >
                    {connectM.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Plug className="h-4 w-4 mr-1.5" />
                    )}
                    Conectar Salesforce
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">Mapeamento de campos</CardTitle>
          <CardDescription>
            Os mapeamentos padrão são criados ao conectar. Ajuste a direção de cada campo ou adicione
            novos pares.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border border-gold/40 bg-gold/5 p-4 text-sm space-y-1.5">
            <p className="font-medium flex items-center gap-2">
              <Info className="h-4 w-4 text-gold" /> Correspondência por CNPJ (recomendado)
            </p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              A correspondência usa esta ordem: vínculo já existente → CNPJ → nome da conta. Para a
              camada de CNPJ funcionar, o Salesforce do cliente precisa de um campo customizado{" "}
              <code className="font-mono">{SF_CNPJ_FIELD}</code> no objeto Account. Crie em{" "}
              <strong>Setup → Object Manager → Account → Fields &amp; Relationships → New</strong>,
              tipo <strong>Text</strong>, com nome da API <code className="font-mono">CNPJ</code>.
              Se o campo não existir, a sincronização continua funcionando normalmente apenas por
              nome — sem a confiabilidade extra do CNPJ.
            </p>
          </div>


          <div className="grid gap-3 md:grid-cols-5 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Objeto NSB</Label>
              <Select
                value={nsbObject}
                onValueChange={(v) => {
                  setNsbObject(v as NsbObject);
                  setNsbField("");
                  setCrmField("");
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(NSB_OBJECT_LABELS) as NsbObject[]).map((o) => (
                    <SelectItem key={o} value={o}>{NSB_OBJECT_LABELS[o]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Campo NSB</Label>
              <Select value={nsbField} onValueChange={setNsbField}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {availableNsbFields.map((f) => (
                    <SelectItem key={f.field} value={f.field}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Campo {CRM_OBJECT_FOR[nsbObject]}</Label>
              <Input
                list="sf-fields"
                value={crmField}
                onChange={(e) => setCrmField(e.target.value)}
                placeholder="Ex.: Name"
              />
              <datalist id="sf-fields">
                {availableCrmFields.map((f) => <option key={f} value={f} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Direção</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as SyncDirection)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SYNC_DIRECTION_LABELS) as SyncDirection[]).map((d) => (
                    <SelectItem key={d} value={d}>{SYNC_DIRECTION_LABELS[d]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => saveMappingM.mutate()}
              disabled={!nsbField || !crmField.trim() || saveMappingM.isPending}
            >
              <Plus className="h-4 w-4 mr-1.5" /> Salvar
            </Button>
          </div>

          <div className="rounded-lg border border-border/60 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Objeto NSB</TableHead>
                  <TableHead>Campo NSB</TableHead>
                  <TableHead>Objeto CRM</TableHead>
                  <TableHead>Campo CRM</TableHead>
                  <TableHead>Direção</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappingsQ.isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">Carregando...</TableCell></TableRow>
                ) : (mappingsQ.data ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">Nenhum mapeamento configurado.</TableCell></TableRow>
                ) : (
                  (mappingsQ.data ?? []).map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm">{NSB_OBJECT_LABELS[m.nsb_object as NsbObject] ?? m.nsb_object}</TableCell>
                      <TableCell className="font-mono text-xs">{m.nsb_field}</TableCell>
                      <TableCell className="text-sm">{m.crm_object}</TableCell>
                      <TableCell className="font-mono text-xs">{m.crm_field}</TableCell>
                      <TableCell>
                        <Select
                          value={m.sync_direction}
                          onValueChange={(v) =>
                            updateDirectionM.mutate({ ...m, sync_direction: v })
                          }
                        >
                          <SelectTrigger className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(Object.keys(SYNC_DIRECTION_LABELS) as SyncDirection[]).map((d) => (
                              <SelectItem key={d} value={d}>{SYNC_DIRECTION_LABELS[d]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeMappingM.mutate(m.id)}
                          aria-label="Remover mapeamento"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">Histórico de sincronização</CardTitle>
          <CardDescription>Últimos 50 eventos, incluindo conflitos resolvidos por data/hora.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border/60 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Direção</TableHead>
                  <TableHead>Objeto</TableHead>
                  <TableHead>Registro CRM</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Detalhe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logQ.isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">Carregando...</TableCell></TableRow>
                ) : (logQ.data ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">Nenhum evento registrado.</TableCell></TableRow>
                ) : (
                  (logQ.data ?? []).map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs whitespace-nowrap">{fmt(l.synced_at)}</TableCell>
                      <TableCell className="text-xs">{l.direction === "to_crm" ? "NSB → CRM" : "CRM → NSB"}</TableCell>
                      <TableCell className="text-xs">{l.nsb_object}</TableCell>
                      <TableCell className="font-mono text-xs">{l.crm_record_id ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[l.status] ?? "outline"}>
                          {STATUS_LABEL[l.status] ?? l.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[320px] truncate" title={l.detail ?? ""}>
                        {l.detail ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
