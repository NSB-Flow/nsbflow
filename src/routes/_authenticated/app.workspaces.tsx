import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useWorkspace } from "@/lib/workspace-context";
import { useAuth } from "@/lib/auth-context";
import { createWorkspaceFn } from "@/lib/workspaces.functions";
import { toast } from "sonner";
import { Plus, Check, Building2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/workspaces")({
  head: () => ({ meta: [{ title: "Workspaces — NSB Flow" }] }),
  component: WorkspacesPage,
});

function WorkspacesPage() {
  const { workspaces, workspaceId, switchWorkspace, refresh } = useWorkspace();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const create = async () => {
    if (!name.trim() || !user) return;
    try {
      const ws = await createWorkspaceFn({ data: { name: name.trim() } });
      toast.success(`Workspace ${ws.name} criado`);
      await refresh();
      qc.invalidateQueries();
      setName("");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar workspace");
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="text-xs uppercase tracking-wider text-gold font-medium">Multi-empresa</div>
          <h1 className="font-display text-3xl font-bold mt-1">Workspaces</h1>
          <p className="text-muted-foreground mt-1">Gerencie múltiplas empresas em uma única conta.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1.5" /> Novo workspace</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-display">Criar novo workspace</DialogTitle></DialogHeader>
            <div>
              <Label>Nome da empresa *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Empresa ABC" />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={create} disabled={!name.trim()}>Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle className="font-display">Seus workspaces ({workspaces.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="divide-y">
            {workspaces.map((w) => {
              const active = w.id === workspaceId;
              return (
                <button
                  key={w.id}
                  onClick={() => switchWorkspace(w.id)}
                  className="w-full flex items-center gap-4 py-3 hover:bg-muted/40 -mx-2 px-2 rounded-md text-left"
                >
                  <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium flex items-center gap-2">
                      {w.name}
                      {w.is_personal && <Badge variant="outline" className="text-[10px]">Pessoal</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">/{w.slug}</div>
                  </div>
                  {active && <Check className="h-5 w-5 text-gold" />}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
