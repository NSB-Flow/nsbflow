import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/lib/workspace-context";
import { applyReferralPaidFn } from "@/lib/credits.functions";
import { toast } from "sonner";
import { CreditCard, Lock, Loader2, Users as UsersIcon } from "lucide-react";
import { z } from "zod";

const searchSchema = z.object({
  plan: z.enum(["smart", "pro", "enterprise"]).optional(),
  cycle: z.enum(["monthly", "yearly"]).optional(),
});

export const Route = createFileRoute("/_authenticated/app/checkout")({
  head: () => ({ meta: [{ title: "Checkout — NSB Flow" }] }),
  validateSearch: (search) => searchSchema.parse(search),
  component: CheckoutPage,
});

function formatBRL(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function CheckoutPage() {
  const search = Route.useSearch();
  const nav = useNavigate();
  const { workspaceId, workspace } = useWorkspace();
  const [cycle, setCycle] = useState<"monthly" | "yearly">(search.cycle ?? "monthly");
  const [coupon, setCoupon] = useState("");
  const [couponApplied, setCouponApplied] = useState<{ code: string; percent: number } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [seats, setSeats] = useState<number>(1);
  const applyReferralPaid = useServerFn(applyReferralPaidFn);
  const isPersonal = workspace?.is_personal ?? true;

  const { data: plan } = useQuery({
    queryKey: ["checkout-plan", search.plan],
    enabled: !!search.plan,
    queryFn: async () => {
      const { data } = await supabase.from("plans").select("*").eq("tier", search.plan!).maybeSingle();
      return data;
    },
  });

  const basePrice = useMemo(() => {
    if (!plan) return 0;
    return cycle === "yearly" ? plan.price_yearly_cents : plan.price_monthly_cents;
  }, [plan, cycle]);

  const discount = couponApplied ? Math.round((basePrice * couponApplied.percent) / 100) : 0;
  const total = Math.max(0, basePrice - discount);

  const applyCoupon = async () => {
    if (!coupon.trim()) return;
    const { data } = await supabase.from("coupons").select("*").eq("code", coupon.trim().toUpperCase()).eq("active", true).maybeSingle();
    if (!data) {
      toast.error("Cupom inválido");
      return;
    }
    setCouponApplied({ code: data.code, percent: data.percent_off ?? 0 });
    toast.success(`Cupom ${data.code} aplicado`);
  };

  const subscribe = async () => {
    if (!plan || !workspaceId) return;
    // Gate: PF só Smart/Pro; PJ só Pro/Enterprise
    if (isPersonal && plan.tier === "enterprise") {
      toast.error("Enterprise disponível apenas para workspaces de empresa.");
      return;
    }
    if (!isPersonal && plan.tier === "smart") {
      toast.error("Smart disponível apenas para uso pessoal.");
      return;
    }
    setProcessing(true);
    try {
      const effectiveSeats = isPersonal ? 1 : Math.max(1, seats);
      const { error } = await supabase
        .from("subscriptions")
        .update({
          plan_id: plan.id,
          status: "active",
          billing_cycle: cycle,
          seats: effectiveSeats,
          current_period_start: new Date().toISOString(),
          current_period_end: new Date(Date.now() + (cycle === "yearly" ? 365 : 30) * 86400000).toISOString(),
          trial_ends_at: null,
          provider: "manual",
        })
        .eq("workspace_id", workspaceId);

      if (error) throw error;

      const { data: sub } = await supabase.from("subscriptions").select("id").eq("workspace_id", workspaceId).maybeSingle();
      if (sub) {
        await supabase.from("subscription_invoices").insert({
          subscription_id: sub.id,
          amount_cents: total,
          currency: "BRL",
          status: "paid",
          paid_at: new Date().toISOString(),
        });
      }

      // Dispara bônus de indicação (idempotente no servidor)
      try { await applyReferralPaid(); } catch { /* noop */ }

      toast.success("Assinatura ativada!");
      nav({ to: "/app/assinatura" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no checkout");
    } finally {
      setProcessing(false);
    }
  };

  if (!search.plan || !plan) {
    return (
      <div className="p-8 max-w-md mx-auto text-center">
        <p className="text-muted-foreground">Selecione um plano primeiro.</p>
        <Button asChild className="mt-4"><Link to="/app/planos">Ver planos</Link></Button>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-wider text-gold font-medium">Checkout</div>
        <h1 className="font-display text-3xl font-bold mt-1">Confirme sua assinatura</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="font-display">Periodicidade</CardTitle></CardHeader>
            <CardContent>
              <RadioGroup value={cycle} onValueChange={(v) => setCycle(v as "monthly" | "yearly")} className="space-y-3">
                <label className="flex items-center gap-3 border rounded-lg p-4 cursor-pointer hover:bg-muted/40">
                  <RadioGroupItem value="monthly" />
                  <div className="flex-1">
                    <div className="font-medium">Mensal</div>
                    <div className="text-sm text-muted-foreground">{formatBRL(plan.price_monthly_cents)} por mês</div>
                  </div>
                </label>
                <label className="flex items-center gap-3 border rounded-lg p-4 cursor-pointer hover:bg-muted/40">
                  <RadioGroupItem value="yearly" />
                  <div className="flex-1">
                    <div className="font-medium flex items-center gap-2">
                      Anual <Badge className="bg-gold text-primary-foreground hover:bg-gold">2 meses grátis</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatBRL(plan.price_yearly_cents)} por ano — equivalente a {formatBRL(plan.price_yearly_cents / 12)}/mês
                    </div>
                  </div>
                </label>
              </RadioGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="font-display">Cupom de desconto</CardTitle></CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="CUPOM10" />
                <Button variant="outline" onClick={applyCoupon}>Aplicar</Button>
              </div>
              {couponApplied && (
                <p className="text-sm text-gold mt-2">✓ Cupom {couponApplied.code} — {couponApplied.percent}% off</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="font-display">Forma de pagamento</CardTitle></CardHeader>
            <CardContent>
              <div className="border rounded-lg p-4 flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <div className="font-medium">Gateway em configuração</div>
                  <div className="text-xs text-muted-foreground">Stripe, Mercado Pago, Asaas ou PagSeguro. Configure em Configurações.</div>
                </div>
                <Badge variant="outline">Manual</Badge>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-3">
                <Lock className="h-3 w-3" /> Pagamento seguro
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="sticky top-20 border-gold/40">
            <CardHeader>
              <CardTitle className="font-display">Resumo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Plano {plan.name}</div>
                  <div className="text-xs text-muted-foreground capitalize">{cycle === "yearly" ? "Anual" : "Mensal"}</div>
                </div>
                <div>{formatBRL(basePrice)}</div>
              </div>
              {couponApplied && (
                <div className="flex justify-between text-sm text-gold">
                  <span>Desconto ({couponApplied.code})</span>
                  <span>-{formatBRL(discount)}</span>
                </div>
              )}
              <div className="border-t pt-3 flex justify-between font-display font-bold text-xl">
                <span>Total</span>
                <span>{formatBRL(total)}</span>
              </div>
              <Button size="lg" className="w-full mt-4" onClick={subscribe} disabled={processing}>
                {processing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processando...</> : "Assinar Agora"}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center mt-2">
                Ao assinar, você concorda com nossos termos de serviço.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
