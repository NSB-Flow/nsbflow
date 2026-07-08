import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { Calendar, MessagesSquare, ClipboardCheck, Bell, Star, TrendingUp } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({ meta: [{ title: "Dashboard — NSB Flow" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { fullName, user } = useAuth();
  const first = (fullName ?? user?.email ?? "").split(" ")[0];

  const { data: runs = [] } = useQuery({
    queryKey: ["dashboard-runs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("agent_runs")
        .select("id, agent, title, company_name, status, favorite, created_at")
        .order("created_at", { ascending: false })
        .limit(6);
      return data ?? [];
    },
  });

  const briefings = runs.filter((r) => r.agent === "briefing");
  const meetings = runs.filter((r) => r.agent === "meeting");

  const stats = [
    { label: "Briefings gerados", value: briefings.length, icon: MessagesSquare, tone: "accent" as const },
    { label: "Reuniões analisadas", value: meetings.length, icon: ClipboardCheck, tone: "gold" as const },
    { label: "Favoritos", value: runs.filter((r) => r.favorite).length, icon: Star, tone: "success" as const },
    { label: "Últimos 30d", value: runs.length, icon: TrendingUp, tone: "primary" as const },
  ];

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-sm text-muted-foreground">Bem-vindo(a) de volta</p>
        <h1 className="font-display text-3xl font-bold mt-1">
          Olá, {first || "usuário"}.
        </h1>
        <p className="text-muted-foreground mt-1">
          Sua central de inteligência comercial — DEAP Method™.
        </p>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <Card>
              <CardContent className="p-5 flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    {s.label}
                  </p>
                  <p className="font-display text-3xl font-semibold mt-1">{s.value}</p>
                </div>
                <div className="h-9 w-9 rounded-md nsb-gradient flex items-center justify-center">
                  <s.icon className="h-4 w-4 text-primary-foreground" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="font-display text-lg">Últimas execuções</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/app/historico">Ver tudo</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="divide-y">
                {runs.map((r) => (
                  <Link
                    key={r.id}
                    to="/app/historico/$id"
                    params={{ id: r.id }}
                    className="flex items-center justify-between py-3 hover:bg-muted/50 -mx-2 px-2 rounded-md"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {r.title ?? r.company_name ?? r.agent}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString("pt-BR")}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {r.agent}
                      </Badge>
                      <StatusBadge status={r.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Agenda
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Integração com calendário em breve.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg flex items-center gap-2">
                <Bell className="h-4 w-4" /> Notificações
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Sem notificações no momento.
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-l-4 border-l-[var(--color-gold)]">
        <CardContent className="p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-gold font-medium">
              Começar rápido
            </div>
            <h3 className="font-display text-xl font-semibold mt-1">
              Gerar um novo briefing ou analisar uma reunião
            </h3>
          </div>
          <Button asChild size="lg">
            <Link to="/app/deap-meeting">Abrir DEAP Meeting</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    done: { label: "Concluído", variant: "default" },
    pending: { label: "Em execução", variant: "secondary" },
    error: { label: "Erro", variant: "destructive" },
  };
  const it = map[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={it.variant}>{it.label}</Badge>;
}

function EmptyState() {
  return (
    <div className="text-center py-8 text-sm text-muted-foreground">
      Sem execuções ainda.{" "}
      <Link to="/app/deap-meeting" className="text-accent hover:underline">
        Criar o primeiro briefing →
      </Link>
    </div>
  );
}
