import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useWorkspace } from "@/lib/workspace-context";
import { useEntitlements } from "@/lib/entitlements";
import { ROLE_LABELS, type AppRole } from "@/lib/roles";
import { toast } from "sonner";
import { UserPlus, Trash2, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/equipe")({
  head: () => ({ meta: [{ title: "Equipe — NSB Flow" }] }),
  component: EquipePage,
});

const ASSIGNABLE_ROLES: AppRole[] = ["admin_empresa","ceo","diretor","gerente","coordenador","consultor","vendedor","sdr","cliente"];

function EquipePage() {
  const { workspaceId } = useWorkspace();
  const ent = useEntitlements();
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("vendedor");

  const { data: members = [] } = useQuery({
    queryKey: ["team", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("workspace_members")
        .select("id, user_id, role, active, joined_at, profiles(full_name, avatar_url)")
        .eq("workspace_id", workspaceId!)
        .eq("active", true)
        .order("joined_at");
      return data ?? [];
    },
  });

  const canInvite = ent.seatsTotal == null || ent.seatsUsed < ent.seatsTotal;

  const updateRole = async (memberId: string, newRole: AppRole) => {
    const { error } = await supabase.from("workspace_members").update({ role: newRole }).eq("id", memberId);
    if (error) toast.error(error.message);
    else {
      toast.success("Perfil atualizado");
      qc.invalidateQueries({ queryKey: ["team"] });
    }
  };

  const removeMember = async (memberId: string) => {
    if (!confirm("Remover este membro do workspace?")) return;
    const { error } = await supabase.from("workspace_members").update({ active: false }).eq("id", memberId);
    if (error) toast.error(error.message);
    else {
      toast.success("Membro removido");
      qc.invalidateQueries({ queryKey: ["team"] });
    }
  };

  const invite = async () => {
    toast.info(
      "Convite por e-mail em preparação. Peça ao usuário para criar conta com este e-mail — ele entrará automaticamente no workspace.",
    );
    setInviteOpen(false);
    setEmail("");
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="text-xs uppercase tracking-wider text-gold font-medium">Gestão</div>
          <h1 className="font-display text-3xl font-bold mt-1">Equipe</h1>
          <p className="text-muted-foreground mt-1">Gerencie usuários e perfis do seu workspace.</p>
        </div>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button disabled={!canInvite}>
              <UserPlus className="h-4 w-4 mr-1.5" /> Convidar usuário
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-display">Convidar novo usuário</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>E-mail *</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@empresa.com" />
              </div>
              <div>
                <Label>Perfil</Label>
                <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSIGNABLE_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setInviteOpen(false)}>Cancelar</Button>
              <Button onClick={invite} disabled={!email}>Enviar convite</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="mb-6">
        <CardContent className="p-5 flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Licenças</div>
              <div className="font-display text-2xl font-bold">
                {ent.seatsUsed} <span className="text-muted-foreground text-base font-normal">/ {ent.seatsTotal ?? "∞"}</span>
              </div>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            {ent.seatsAvailable ?? "ilimitadas"} disponível(is) no plano <span className="font-medium text-foreground">{ent.planName}</span>
          </div>
          {!canInvite && (
            <Badge variant="destructive">Licenças esgotadas — faça upgrade</Badge>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="font-display">Membros ({members.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="divide-y">
            {members.map((m) => {
              const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
              return (
                <div key={m.id} className="flex items-center gap-4 py-3">
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                    {(p?.full_name ?? "?").split(" ").map((s: string) => s[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p?.full_name ?? "Sem nome"}</div>
                    <div className="text-xs text-muted-foreground">Entrou em {new Date(m.joined_at).toLocaleDateString("pt-BR")}</div>
                  </div>
                  <Select value={m.role} onValueChange={(v) => updateRole(m.id, v as AppRole)}>
                    <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ASSIGNABLE_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="icon" variant="ghost" onClick={() => removeMember(m.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
