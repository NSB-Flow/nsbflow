import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/trial-expirado")({
  head: () => ({ meta: [{ title: "Trial expirado — NSB Flow" }] }),
  component: TrialExpiradoPage,
});

function TrialExpiradoPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg text-center">
        <div className="h-16 w-16 rounded-full bg-gold/10 border border-gold/30 mx-auto flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-gold" />
        </div>
        <div className="text-xs uppercase tracking-[0.2em] text-gold font-medium mt-6">Período de teste encerrado</div>
        <h1 className="font-display text-3xl md:text-4xl font-bold mt-3">
          Seu período de teste expirou.
        </h1>
        <p className="text-muted-foreground mt-4 text-lg">
          Escolha um plano para continuar utilizando os agentes NSB Flow e ter acesso completo à sua central de inteligência comercial.
        </p>
        <div className="mt-8 flex gap-3 justify-center">
          <Button asChild size="lg" className="bg-gold text-primary-foreground hover:bg-gold/90">
            <Link to="/app/planos">Escolher Plano</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <a href="mailto:contato@nsb.com.br">Falar com Especialista</a>
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
