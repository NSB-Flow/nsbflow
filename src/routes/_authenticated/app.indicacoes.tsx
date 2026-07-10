import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Copy, Gift, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/indicacoes")({
  head: () => ({ meta: [{ title: "Indicações — NSB Flow" }] }),
  component: IndicacoesPage,
});

const CREDITS_PER_REFERRAL = 100;

function IndicacoesPage() {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["profile-referral", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("profiles").select("referral_code").eq("id", user!.id).maybeSingle()).data,
  });

  const { data: credits } = useQuery({
    queryKey: ["user-credits", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("user_credits").select("*").eq("user_id", user!.id).maybeSingle()).data,
  });

  const { data: referrals = [] } = useQuery({
    queryKey: ["my-referrals", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("referrals").select("*").eq("referrer_user_id", user!.id).order("created_at", { ascending: false })).data ?? [],
  });

  const { data: tx = [] } = useQuery({
    queryKey: ["credit-tx", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("credit_transactions").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(20)).data ?? [],
  });

  const code = profile?.referral_code ?? "—";
  const link = typeof window !== "undefined" ? `${window.location.origin}/auth?ref=${code}` : "";
  const balance = credits?.balance ?? 0;
  const lifetime = credits?.lifetime_earned ?? 0;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiado!");
    } catch { toast.error("Não foi possível copiar"); }
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="text-xs uppercase tracking-wider text-gold font-medium">Programa de Indicação</div>
        <h1 className="font-display text-3xl font-bold mt-1">Indique e ganhe créditos</h1>
        <p className="text-muted-foreground mt-1">Cada novo cliente que se cadastrar pelo seu link te dá <strong>{CREDITS_PER_REFERRAL} créditos</strong>.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card className="border-gold/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground"><Sparkles className="h-3.5 w-3.5" /> Saldo</div>
            <div className="font-display text-3xl font-bold mt-1 text-gold">{balance}</div>
            <div className="text-xs text-muted-foreground">créditos disponíveis</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground"><Gift className="h-3.5 w-3.5" /> Total ganho</div>
            <div className="font-display text-3xl font-bold mt-1">{lifetime}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground"><Users className="h-3.5 w-3.5" /> Indicações</div>
            <div className="font-display text-3xl font-bold mt-1">{referrals.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle className="font-display text-base">Seu link exclusivo</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 items-center">
            <div className="flex-1 border rounded-md px-3 py-2 bg-muted/40 font-mono text-sm truncate">{link}</div>
            <Button variant="outline" size="sm" onClick={() => copy(link)}><Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar link</Button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Ou compartilhe seu código:</span>
            <button onClick={() => copy(code)} className="font-mono font-bold px-2 py-0.5 rounded bg-gold/10 text-gold border border-gold/30 hover:bg-gold/20">
              {code}
            </button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="font-display text-base">Suas indicações</CardTitle></CardHeader>
          <CardContent>
            {referrals.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma indicação ainda. Compartilhe seu link!</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Status</TableHead><TableHead>Créditos</TableHead></TableRow></TableHeader>
                <TableBody>
                  {referrals.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>{new Date(r.created_at).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell><Badge variant={r.status === "converted" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
                      <TableCell className="text-gold font-medium">+{r.credits_awarded}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="font-display text-base">Histórico de créditos</CardTitle></CardHeader>
          <CardContent>
            {tx.length === 0 ? <p className="text-sm text-muted-foreground">Sem movimentações.</p> : (
              <div className="space-y-2">
                {tx.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                    <div>
                      <div className="font-medium">{t.description ?? t.kind}</div>
                      <div className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString("pt-BR")}</div>
                    </div>
                    <span className={t.amount > 0 ? "text-gold font-medium" : "text-destructive"}>{t.amount > 0 ? "+" : ""}{t.amount}</span>
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
