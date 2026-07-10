import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Shield, DollarSign, TrendingUp, Users, Ticket, Package, Plus, Building2, ArrowUpRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/admin")({
  head: () => ({ meta: [{ title: "Super Admin — NSB Flow" }] }),
  component: AdminPage,
});

function fmtBRL(cents: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents ?? 0) / 100);
}
function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
}

function AdminPage() {
  const { roles } = useAuth();
  if (!roles.includes("super_admin")) return <Navigate to="/app" />;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-gold/10 border border-gold/30 flex items-center justify-center">
          <Shield className="h-5 w-5 text-gold" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-gold font-medium">Painel do Proprietário</div>
          <h1 className="font-display text-3xl font-bold">Super Administrador</h1>
        </div>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="plans">Planos</TabsTrigger>
          <TabsTrigger value="coupons">Cupons</TabsTrigger>
          <TabsTrigger value="companies">Empresas</TabsTrigger>
          <TabsTrigger value="subscriptions">Assinaturas</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard" className="mt-6"><DashboardTab /></TabsContent>
        <TabsContent value="plans" className="mt-6"><PlansTab /></TabsContent>
        <TabsContent value="coupons" className="mt-6"><CouponsTab /></TabsContent>
        <TabsContent value="companies" className="mt-6"><CompaniesTab /></TabsContent>
        <TabsContent value="subscriptions" className="mt-6"><SubscriptionsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */
function DashboardTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: async () => {
      const [{ data: subs }, { count: workspaces }, { data: runs }] = await Promise.all([
        supabase.from("subscriptions").select("status,billing_cycle,plan_id,current_period_end,plans(tier,name,price_monthly_cents,price_yearly_cents)"),
        supabase.from("workspaces").select("id", { count: "exact", head: true }),
        supabase.from("agent_runs").select("agent,created_at").order("created_at", { ascending: false }).limit(500),
      ]);
      return { subs: subs ?? [], workspaces: workspaces ?? 0, runs: runs ?? [] };
    },
  });

  if (isLoading || !data) return <div className="text-muted-foreground">Carregando métricas…</div>;

  const active = data.subs.filter((s: any) => s.status === "active");
  const trialing = data.subs.filter((s: any) => s.status === "trialing");
  const canceled = data.subs.filter((s: any) => s.status === "canceled" || s.status === "expired");

  let mrr = 0;
  let arr = 0;
  for (const s of active as any[]) {
    const plan = Array.isArray(s.plans) ? s.plans[0] : s.plans;
    if (!plan) continue;
    if (s.billing_cycle === "yearly") {
      arr += plan.price_yearly_cents ?? 0;
      mrr += Math.round((plan.price_yearly_cents ?? 0) / 12);
    } else {
      mrr += plan.price_monthly_cents ?? 0;
      arr += (plan.price_monthly_cents ?? 0) * 12;
    }
  }

  const ticket = active.length ? mrr / active.length : 0;
  const conversion = trialing.length + active.length > 0 ? (active.length / (active.length + trialing.length)) * 100 : 0;
  const churn = active.length + canceled.length > 0 ? (canceled.length / (active.length + canceled.length)) * 100 : 0;

  const byPlan = new Map<string, number>();
  for (const s of active as any[]) {
    const plan = Array.isArray(s.plans) ? s.plans[0] : s.plans;
    const name = plan?.name ?? "—";
    byPlan.set(name, (byPlan.get(name) ?? 0) + 1);
  }

  const byAgent = new Map<string, number>();
  for (const r of data.runs) byAgent.set(r.agent, (byAgent.get(r.agent) ?? 0) + 1);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={DollarSign} label="MRR" value={fmtBRL(mrr)} accent />
        <Kpi icon={TrendingUp} label="ARR" value={fmtBRL(arr)} />
        <Kpi icon={Users} label="Clientes ativos" value={String(active.length)} />
        <Kpi icon={Users} label="Em trial" value={String(trialing.length)} />
        <Kpi icon={ArrowUpRight} label="Conversão Trial→Pago" value={`${conversion.toFixed(1)}%`} />
        <Kpi icon={TrendingUp} label="Churn" value={`${churn.toFixed(1)}%`} />
        <Kpi icon={DollarSign} label="Ticket médio" value={fmtBRL(ticket)} />
        <Kpi icon={Building2} label="Workspaces" value={String(data.workspaces)} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="font-display text-base">Distribuição por plano</CardTitle></CardHeader>
          <CardContent>
            {[...byPlan.entries()].length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem assinaturas ativas.</p>
            ) : (
              <div className="space-y-2">
                {[...byPlan.entries()].map(([name, count]) => {
                  const pct = active.length ? (count / active.length) * 100 : 0;
                  return (
                    <div key={name}>
                      <div className="flex justify-between text-sm mb-1"><span>{name}</span><span className="text-muted-foreground">{count} ({pct.toFixed(0)}%)</span></div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="font-display text-base">Execuções por agente (últimas 500)</CardTitle></CardHeader>
          <CardContent>
            {[...byAgent.entries()].length === 0 ? (
              <p className="text-sm text-muted-foreground">Ainda sem execuções.</p>
            ) : (
              <div className="space-y-1.5">
                {[...byAgent.entries()].sort((a, b) => b[1] - a[1]).map(([a, c]) => (
                  <div key={a} className="flex justify-between text-sm border-b py-1.5 last:border-0">
                    <span>{a}</span><Badge variant="secondary">{c}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent?: boolean }) {
  return (
    <Card className={accent ? "border-gold/40" : ""}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground"><Icon className="h-3.5 w-3.5" /> {label}</div>
        <div className={`font-display text-2xl font-bold mt-1 ${accent ? "text-gold" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

/* ---------------- Plans ---------------- */
function PlansTab() {
  const qc = useQueryClient();
  const { data: plans = [] } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: async () => (await supabase.from("plans").select("*").order("price_monthly_cents")).data ?? [],
  });
  const [editing, setEditing] = useState<any | null>(null);

  const save = async (p: any) => {
    const patch = {
      name: p.name,
      price_monthly_cents: Number(p.price_monthly_cents),
      price_yearly_cents: Number(p.price_yearly_cents),
      max_users: p.max_users ? Number(p.max_users) : null,
      active: p.active,
    };
    const { error } = await supabase.from("plans").update(patch).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Plano atualizado");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["admin-plans"] });
  };

  return (
    <Card>
      <CardHeader><CardTitle className="font-display flex items-center gap-2"><Package className="h-4 w-4" /> Planos</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Tier</TableHead><TableHead>Nome</TableHead><TableHead>Mensal</TableHead><TableHead>Anual</TableHead>
            <TableHead>Usuários</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {plans.map((p) => (
              <TableRow key={p.id}>
                <TableCell><Badge variant="outline" className="uppercase">{p.tier}</Badge></TableCell>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{fmtBRL(p.price_monthly_cents)}</TableCell>
                <TableCell>{fmtBRL(p.price_yearly_cents)}</TableCell>
                <TableCell>{p.max_users ?? "∞"}</TableCell>
                <TableCell>{p.active ? <Badge>Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}</TableCell>
                <TableCell><Button size="sm" variant="outline" onClick={() => setEditing({ ...p })}>Editar</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">Editar plano</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Mensal (centavos)</Label><Input type="number" value={editing.price_monthly_cents} onChange={(e) => setEditing({ ...editing, price_monthly_cents: e.target.value })} /></div>
                <div><Label>Anual (centavos)</Label><Input type="number" value={editing.price_yearly_cents} onChange={(e) => setEditing({ ...editing, price_yearly_cents: e.target.value })} /></div>
              </div>
              <div><Label>Máx. usuários (vazio = ilimitado)</Label><Input type="number" value={editing.max_users ?? ""} onChange={(e) => setEditing({ ...editing, max_users: e.target.value })} /></div>
              <div className="flex items-center justify-between border rounded-md p-3">
                <Label>Ativo</Label>
                <Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={() => save(editing)}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------------- Coupons ---------------- */
function CouponsTab() {
  const qc = useQueryClient();
  const { data: coupons = [] } = useQuery({
    queryKey: ["admin-coupons"],
    queryFn: async () => (await supabase.from("coupons").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", discount_type: "percent" as "percent" | "fixed", discount_value: 20, max_redemptions: 100, valid_until: "" });

  const create = async () => {
    if (!form.code.trim()) return toast.error("Informe o código");
    const payload: any = {
      code: form.code.trim().toUpperCase(),
      max_redemptions: form.max_redemptions || null,
      valid_until: form.valid_until || null,
      active: true,
    };
    if (form.discount_type === "percent") payload.percent_off = form.discount_value;
    else payload.amount_off_cents = form.discount_value;
    const { error } = await supabase.from("coupons").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Cupom criado");
    setOpen(false);
    setForm({ code: "", discount_type: "percent", discount_value: 20, max_redemptions: 100, valid_until: "" });
    qc.invalidateQueries({ queryKey: ["admin-coupons"] });
  };

  const toggle = async (c: any) => {
    await supabase.from("coupons").update({ active: !c.active }).eq("id", c.id);
    qc.invalidateQueries({ queryKey: ["admin-coupons"] });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="font-display flex items-center gap-2"><Ticket className="h-4 w-4" /> Cupons</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-3.5 w-3.5 mr-1" /> Novo cupom</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-display">Criar cupom</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Código *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="WELCOME20" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <select className="w-full border rounded-md h-9 px-2 bg-background" value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value as "percent" | "fixed" })}>
                    <option value="percent">Percentual</option>
                    <option value="fixed">Valor fixo (centavos)</option>
                  </select>
                </div>
                <div><Label>Valor</Label><Input type="number" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Usos máximos</Label><Input type="number" value={form.max_redemptions} onChange={(e) => setForm({ ...form, max_redemptions: Number(e.target.value) })} /></div>
                <div><Label>Válido até</Label><Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} /></div>
              </div>
            </div>
            <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={create}>Criar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {coupons.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum cupom criado ainda.</p> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Código</TableHead><TableHead>Desconto</TableHead><TableHead>Usos</TableHead>
              <TableHead>Válido até</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {coupons.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono">{c.code}</TableCell>
                  <TableCell>{c.percent_off != null ? `${c.percent_off}%` : fmtBRL(c.amount_off_cents)}</TableCell>
                  <TableCell>{c.redeemed_count ?? 0} / {c.max_redemptions ?? "∞"}</TableCell>
                  <TableCell>{fmtDate(c.valid_until)}</TableCell>
                  <TableCell>{c.active ? <Badge>Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}</TableCell>
                  <TableCell><Button size="sm" variant="ghost" onClick={() => toggle(c)}>{c.active ? "Desativar" : "Ativar"}</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Companies ---------------- */
function CompaniesTab() {
  const { data = [] } = useQuery({
    queryKey: ["admin-workspaces"],
    queryFn: async () => (await supabase.from("workspaces").select("id,name,slug,is_personal,created_at").order("created_at", { ascending: false })).data ?? [],
  });
  return (
    <Card>
      <CardHeader><CardTitle className="font-display flex items-center gap-2"><Building2 className="h-4 w-4" /> Workspaces / Empresas</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Slug</TableHead><TableHead>Tipo</TableHead><TableHead>Criado em</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.map((w: any) => (
              <TableRow key={w.id}>
                <TableCell className="font-medium">{w.name}</TableCell>
                <TableCell className="font-mono text-xs">{w.slug}</TableCell>
                <TableCell>{w.is_personal ? <Badge variant="outline">Pessoal</Badge> : <Badge>Empresa</Badge>}</TableCell>
                <TableCell>{fmtDate(w.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ---------------- Subscriptions ---------------- */
function SubscriptionsTab() {
  const { data = [] } = useQuery({
    queryKey: ["admin-subs"],
    queryFn: async () => (await supabase.from("subscriptions")
      .select("id,status,billing_cycle,seats,current_period_end,trial_ends_at,workspaces(name),plans(name,tier)")
      .order("created_at", { ascending: false })).data ?? [],
  });
  return (
    <Card>
      <CardHeader><CardTitle className="font-display">Todas as assinaturas</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Workspace</TableHead><TableHead>Plano</TableHead><TableHead>Status</TableHead>
            <TableHead>Ciclo</TableHead><TableHead>Licenças</TableHead><TableHead>Próxima cobrança</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.map((s: any) => {
              const ws = Array.isArray(s.workspaces) ? s.workspaces[0] : s.workspaces;
              const pl = Array.isArray(s.plans) ? s.plans[0] : s.plans;
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{ws?.name ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="uppercase">{pl?.tier}</Badge> {pl?.name}</TableCell>
                  <TableCell><Badge variant={s.status === "active" ? "default" : s.status === "trialing" ? "secondary" : "destructive"}>{s.status}</Badge></TableCell>
                  <TableCell>{s.billing_cycle}</TableCell>
                  <TableCell>{s.seats ?? "∞"}</TableCell>
                  <TableCell>{fmtDate(s.current_period_end ?? s.trial_ends_at)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
