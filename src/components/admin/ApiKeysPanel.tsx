import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Copy, Key, Plus, Trash2, ShieldAlert, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import {
  listApiKeysFn,
  createApiKeyFn,
  revokeApiKeyFn,
} from "@/lib/api-keys.functions";

interface WorkspaceOption {
  id: string;
  name: string;
  hasGrant: boolean;
}

export function ApiKeysPanel() {
  const [selectedWs, setSelectedWs] = useState<string>("");
  const [newKeyName, setNewKeyName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const qc = useQueryClient();
  const listFn = useServerFn(listApiKeysFn);
  const createFn = useServerFn(createApiKeyFn);
  const revokeFn = useServerFn(revokeApiKeyFn);

  const { data: workspaces = [] } = useQuery({
    queryKey: ["api-keys-workspaces"],
    queryFn: async (): Promise<WorkspaceOption[]> => {
      const { data: ws } = await supabase
        .from("workspaces")
        .select("id, name, subscriptions(id, enterprise_module_grants(feature_key, enabled))")
        .order("name");
      return (ws ?? []).map((w: any) => {
        const sub = Array.isArray(w.subscriptions) ? w.subscriptions[0] : w.subscriptions;
        const grants = sub ? (Array.isArray(sub.enterprise_module_grants) ? sub.enterprise_module_grants : [sub.enterprise_module_grants]) : [];
        const hasGrant = grants.some((g: any) => g?.feature_key === "data_export_api" && g?.enabled);
        return { id: w.id, name: w.name, hasGrant };
      });
    },
  });

  const { data: keys = [], refetch } = useQuery({
    queryKey: ["api-keys", selectedWs],
    queryFn: async () => (selectedWs ? await listFn({ data: { workspaceId: selectedWs } }) : []),
    enabled: !!selectedWs,
  });

  const selectedWsInfo = workspaces.find((w) => w.id === selectedWs);

  async function handleCreate() {
    if (!selectedWs || !newKeyName.trim()) return;
    try {
      const result = await createFn({ data: { workspaceId: selectedWs, name: newKeyName.trim() } });
      setRevealedKey(result.full_key);
      setNewKeyName("");
      setDialogOpen(false);
      refetch();
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao criar chave");
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm("Revogar esta chave? Aplicações que a utilizam perderão o acesso imediatamente.")) return;
    try {
      await revokeFn({ data: { id } });
      toast.success("Chave revogada");
      refetch();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao revogar");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="h-4 w-4" /> Chaves de API — Data Export
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Gere chaves para que o time de BI do cliente consuma os dados via <code>/api/public/v1/*</code> em Power BI, Looker, etc.
            A chave é exibida uma única vez.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
            <div>
              <Label className="text-xs">Workspace</Label>
              <Select value={selectedWs} onValueChange={setSelectedWs}>
                <SelectTrigger><SelectValue placeholder="Selecione um workspace" /></SelectTrigger>
                <SelectContent>
                  {workspaces.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} {w.hasGrant ? "" : "· sem add-on"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => setDialogOpen(true)} disabled={!selectedWs}>
              <Plus className="h-4 w-4 mr-1.5" /> Nova chave
            </Button>
          </div>

          {selectedWs && selectedWsInfo && !selectedWsInfo.hasGrant && (
            <div className="flex items-start gap-2 text-xs bg-amber-500/10 border border-amber-500/30 rounded-md p-3">
              <ShieldAlert className="h-4 w-4 text-amber-500 mt-0.5" />
              <div>
                Este workspace não tem o add-on <strong>data_export_api</strong> ativo.
                Chaves podem ser criadas para teste, mas as chamadas retornarão <code>403</code> até que o módulo seja habilitado na aba "Individual".
              </div>
            </div>
          )}

          {selectedWs && (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Prefixo</TableHead>
                    <TableHead>Criada em</TableHead>
                    <TableHead>Último uso</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                        Nenhuma chave neste workspace.
                      </TableCell>
                    </TableRow>
                  )}
                  {keys.map((k: any) => (
                    <TableRow key={k.id}>
                      <TableCell className="font-medium">{k.name}</TableCell>
                      <TableCell><code className="text-xs">{k.key_prefix}…</code></TableCell>
                      <TableCell className="text-xs">{format(new Date(k.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</TableCell>
                      <TableCell className="text-xs">
                        {k.last_used_at ? format(new Date(k.last_used_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"}
                      </TableCell>
                      <TableCell>
                        {k.revoked_at ? (
                          <Badge variant="destructive">Revogada</Badge>
                        ) : (
                          <Badge className="bg-emerald-600 text-white">Ativa</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {!k.revoked_at && (
                          <Button variant="ghost" size="sm" onClick={() => handleRevoke(k.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova chave de API</DialogTitle>
            <DialogDescription>Escolha um rótulo descritivo. Ex: "Power BI - Financeiro".</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Rótulo</Label>
            <Input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="Power BI" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!newKeyName.trim()}>Gerar chave</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reveal dialog — key shown ONCE */}
      <Dialog open={!!revealedKey} onOpenChange={(o) => !o && setRevealedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" /> Chave gerada
            </DialogTitle>
            <DialogDescription>
              <strong>Copie a chave agora.</strong> Por segurança, ela não será exibida novamente.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted rounded-md p-3 font-mono text-sm break-all">
            {revealedKey}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (revealedKey) {
                  navigator.clipboard.writeText(revealedKey);
                  toast.success("Chave copiada");
                }
              }}
            >
              <Copy className="h-4 w-4 mr-1.5" /> Copiar
            </Button>
            <Button onClick={() => setRevealedKey(null)}>Já copiei</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
