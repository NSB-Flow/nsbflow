import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEntitlements } from "@/lib/entitlements";
import { useWorkspace } from "@/lib/workspace-context";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { ArrowUpCircle, XCircle, Users, Calendar, Receipt } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/assinatura")({
  head: () => ({ meta: [{ title: "Minha Assinatura — NSB Flow" }] }),
  component: AssinaturaPage,
});

function formatBRL(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function AssinaturaPage() {
  const ent = useEntitlements();
  const { workspaceId } = useWorkspace();

  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices", ent.subscriptionId],
    enabled: !!ent.subscriptionId,
    queryFn: async () => {
      const { data } = await supabase
        .from("subscription_invoices")
        .select("*")
        .eq("subscription_id", ent.subscriptionId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const cancel = async () => {
    if (!confirm("Cancelar sua assinatura ao final do período atual?")) return;
    await supabase.from("subscriptions").update({ cancel_at_period_end: true }).eq("workspace_id", workspaceId!);
    toast.success("Assinatura será cancelada ao final do período.");
  };

  if (ent.loading) return <div className="p-8">Carregando...</div>;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="text-xs uppercase tracking-wider text-gold font-medium">Billing</div>
        <h1 className="font-display text-3xl font-bold mt-1">Minha Assinatura</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle className="font-display text-xl">Plano {ent.planName}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1 capitalize">
                {ent.billingCycle === "yearly" ? "Anual" : "Mensal"}
              </p>
            </div>
            <StatusBadge status={ent.status} isTrialing={ent.isTrialing} isTrialExpired={ent.isTrialExpired} />
          </CardHeader>
          <CardContent className="space-y-4">
            {ent.isTrialing && (
              <div className="bg-gold/10 border border-gold/30 rounded-lg p-4">
                <div className="font-medium">Você está no período de teste gratuito</div>
                <p className="text-sm text-muted-foreground mt-1">Faltam {ent.trialDaysLeft} dia(s). Escolha um plano para continuar.</p>
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-4">
              <InfoCard icon={Calendar} label={ent.isTrialing ? "Fim do teste" : "Próxima cobrança"}
                value={ent.isTrialing ? formatDate(ent.trialEndsAt) : formatDate(ent.currentPeriodEnd)} />
              <InfoCard icon={Users} label="Licenças"
                value={`${ent.seatsUsed} / ${ent.seatsTotal ?? "∞"}`} />
            </div>

            {ent.seatsTotal != null && (
              <div>
                <div className="text-xs text-muted-foreground mb-1.5 flex justify-between">
                  <span>Uso de licenças</span>
                  <span>{ent.seatsUsed} de {ent.seatsTotal} ({ent.seatsAvailable} disponíveis)</span>
                </div>
                <Progress value={(ent.seatsUsed / ent.seatsTotal) * 100} className="h-2" />
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <Button asChild><Link to="/app/planos"><ArrowUpCircle className="h-4 w-4 mr-1.5" /> Fazer upgrade</Link></Button>
              <Button asChild variant="outline"><Link to="/app/equipe"><Users className="h-4 w-4 mr-1.5" /> Gerenciar equipe</Link></Button>
              {ent.status === "active" && (
                <Button variant="ghost" className="text-destructive" onClick={cancel}>
                  <XCircle className="h-4 w-4 mr-1.5" /> Cancelar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="font-display flex items-center gap-2"><Receipt className="h-4 w-4" /> Histórico</CardTitle></CardHeader>
          <CardContent>
            {invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem faturas ainda.</p>
            ) : (
              <div className="space-y-2">
                {invoices.map((i) => (
                  <div key={i.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                    <div>
                      <div className="font-medium">{formatBRL(i.amount_cents)}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(i.created_at)}</div>
                    </div>
                    <Badge variant={i.status === "paid" ? "default" : "secondary"}>{i.status}</Badge>
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

function InfoCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="font-display text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}

function StatusBadge({ status, isTrialing, isTrialExpired }: { status: string | null; isTrialing: boolean; isTrialExpired: boolean }) {
  if (isTrialExpired) return <Badge variant="destructive">Trial expirado</Badge>;
  if (isTrialing) return <Badge className="bg-gold text-primary-foreground hover:bg-gold">Trial</Badge>;
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    active: { label: "Ativo", variant: "default" },
    past_due: { label: "Pagamento pendente", variant: "destructive" },
    canceled: { label: "Cancelado", variant: "secondary" },
    expired: { label: "Expirado", variant: "destructive" },
  };
  const it = map[status ?? ""] ?? { label: status ?? "—", variant: "outline" as const };
  return <Badge variant={it.variant}>{it.label}</Badge>;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}
