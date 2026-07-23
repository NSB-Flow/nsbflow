import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Check, Sparkles, Building2, Zap } from "lucide-react";
import { FEATURE_LABELS, type FeatureKey } from "@/lib/entitlements";
import { listPublicPlansWithFeaturesFn } from "@/lib/plans.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/planos")({
  head: () => ({ meta: [{ title: "Planos — NSB Flow" }] }),
  component: PlanosPage,
});

const FEATURE_LIST: FeatureKey[] = [
  "deap.meeting.briefing",
  "deap.meeting.intelligence",
  "history",
  "pdf.export",
  "deap.assessment.sales",
  "deap.assessment.leadership",
  "deap.assessment.process",
  "deap.assessment.executive",
  "dashboard.executive",
  "reports",
  "biblioteca",
  "academy",
  "empresas",
  "pessoas",
];

function formatBRL(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(cents / 100);
}

function PlanosPage() {
  const [yearly, setYearly] = useState(false);

  const listPlans = useServerFn(listPublicPlansWithFeaturesFn);
  const { data: plans = [] } = useQuery({
    queryKey: ["plans-with-features"],
    queryFn: () => listPlans(),
  });

  const icons: Record<string, typeof Sparkles> = { smart: Sparkles, pro: Zap, enterprise: Building2 };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-3xl mx-auto">
        <div className="text-xs uppercase tracking-[0.2em] text-gold font-medium">Planos NSB Flow</div>
        <h1 className="font-display text-4xl md:text-5xl font-bold mt-3">
          Inteligência comercial <span className="text-gold">de nível executivo</span>
        </h1>
        <p className="text-muted-foreground mt-4 text-lg">
          Escolha o plano ideal para o seu momento. Comece com 3 dias grátis, sem cartão de crédito.
        </p>
        <div className="mt-6 inline-flex items-center gap-3 bg-muted/40 rounded-full px-4 py-2 border">
          <span className={cn("text-sm", !yearly && "font-medium")}>Mensal</span>
          <Switch checked={yearly} onCheckedChange={setYearly} />
          <span className={cn("text-sm", yearly && "font-medium")}>Anual</span>
          {yearly && <Badge className="bg-gold text-primary-foreground hover:bg-gold">2 meses grátis</Badge>}
        </div>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-3 mt-12">
        {plans.map((p: any, i: number) => {
          const Icon = icons[p.tier] ?? Sparkles;
          const highlighted = p.tier === "pro";
          const price = yearly ? p.price_yearly_cents : p.price_monthly_cents;
          const enabled = new Set((p.plan_features ?? []).filter((f: any) => f.enabled).map((f: any) => f.feature_key));

          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.06 }}
              className="relative"
            >
              {highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                  <Badge className="bg-gold text-primary-foreground hover:bg-gold shadow">Mais popular</Badge>
                </div>
              )}
              <Card className={cn("h-full flex flex-col", highlighted && "border-gold shadow-xl ring-1 ring-gold/40")}>
                <CardContent className="p-8 flex flex-col h-full">
                  <div className="flex items-center gap-2">
                    <div className={cn("h-9 w-9 rounded-md flex items-center justify-center", highlighted ? "bg-gold text-primary-foreground" : "bg-primary text-primary-foreground")}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="font-display font-bold text-xl">{p.name}</div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-3">{p.description}</p>

                  <div className="mt-6">
                    {p.tier === "enterprise" ? (
                      <>
                        <div className="font-display text-3xl font-bold">Sob consulta</div>
                        <div className="text-xs text-muted-foreground mt-1">Preço customizado</div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className="font-display text-4xl font-bold">{formatBRL(price)}</span>
                          <span className="text-sm text-muted-foreground">/{yearly ? "ano" : "mês"}</span>
                        </div>
                        {yearly && (
                          <div className="text-xs text-muted-foreground mt-1">
                            equivalente a {formatBRL(p.price_yearly_cents / 12)}/mês
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="mt-4 text-sm">
                    <span className="text-muted-foreground">Licenças: </span>
                    <span className="font-medium">
                      {p.max_users == null ? "Configurável" : `Até ${p.max_users} ${p.max_users === 1 ? "usuário" : "usuários"}`}
                    </span>
                  </div>

                  <ul className="mt-6 space-y-2.5 flex-1">
                    {FEATURE_LIST.map((f) => {
                      const on = enabled.has(f);
                      return (
                        <li key={f} className={cn("flex items-start gap-2 text-sm", !on && "text-muted-foreground/60")}>
                          <Check className={cn("h-4 w-4 mt-0.5 shrink-0", on ? "text-gold" : "opacity-30")} />
                          <span>{FEATURE_LABELS[f]}</span>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="mt-8">
                    {p.tier === "enterprise" ? (
                      <Button asChild variant="outline" className="w-full" size="lg">
                        <a href="mailto:contato@nsb.com.br?subject=NSB%20Flow%20Enterprise">Falar com Especialista</a>
                      </Button>
                    ) : (
                      <Button asChild className={cn("w-full", highlighted && "bg-gold text-primary-foreground hover:bg-gold/90")} size="lg">
                        <Link to="/app/checkout" search={{ plan: p.tier, cycle: yearly ? "yearly" : "monthly" }}>
                          Assinar {p.name}
                        </Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-16 text-center">
        <p className="text-sm text-muted-foreground">
          Todos os planos incluem 3 dias de teste gratuito. Cancele quando quiser.
        </p>
      </div>
    </div>
  );
}
