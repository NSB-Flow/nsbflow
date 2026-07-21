import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, ShieldCheck, LineChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NsbLogo } from "@/components/brand/NsbLogo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NSB Flow — Inteligência Comercial com DEAP Method™" },
      {
        name: "description",
        content:
          "Plataforma enterprise da NSB: briefings de conta, análise de reuniões e desenvolvimento organizacional com o DEAP Method™.",
      },
      { property: "og:title", content: "NSB Flow — Inteligência Comercial que acelera decisões" },
      {
        property: "og:description",
        content:
          "Briefings executivos, ata automática de reuniões e planos de follow-up com o DEAP Method™ da NSB.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://nsbflow.lovable.app/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://nsbflow.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "NSB Flow",
          url: "https://nsbflow.lovable.app/",
          description:
            "Plataforma enterprise da NSB para inteligência comercial, análise de reuniões e desenvolvimento organizacional com o DEAP Method™.",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "NSB Flow",
          url: "https://nsbflow.lovable.app/",
        }),
      },
    ],
  }),

  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="h-16 border-b flex items-center justify-between px-6">
        <NsbLogo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="ghost">
            <Link to="/auth">Entrar</Link>
          </Button>
          <Button asChild>
            <Link to="/auth" search={{ mode: "signup" }}>
              Criar conta
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-6 py-20 lg:py-28">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl"
          >
            <div className="inline-flex items-center gap-2 text-xs font-medium tracking-wider uppercase text-gold border rounded-full px-3 py-1">
              <Sparkles className="h-3 w-3" />
              DEAP Method™
            </div>
            <h1 className="font-display text-4xl md:text-6xl font-bold tracking-tight mt-6 leading-[1.05]">
              Inteligência comercial que <br />
              <span className="text-transparent bg-clip-text nsb-gradient">acelera decisões.</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
              A plataforma da NSB para transformar cada reunião, cada conta e cada
              oportunidade em movimento comercial mensurável.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="gap-2">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Começar agora <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/auth">Já sou cliente</Link>
              </Button>
            </div>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-4 mt-20">
            {[
              {
                icon: Sparkles,
                title: "DEAP Briefing AI",
                desc: "Briefings executivos de conta em minutos: mercado, stakeholders, estratégia e roteiro.",
              },
              {
                icon: LineChart,
                title: "DEAP Meeting Intelligence",
                desc: "Ata automática, qualidade da reunião, oportunidades perdidas e plano de follow-up.",
              },
              {
                icon: ShieldCheck,
                title: "Enterprise-ready",
                desc: "Controle de acesso por perfil, histórico completo e exportação em PDF corporativo.",
              },
            ].map((f) => (
              <div key={f.title} className="nsb-card p-6">
                <f.icon className="h-5 w-5 text-accent" />
                <h2 className="font-display font-semibold text-base mt-4">{f.title}</h2>
                <p className="text-sm text-muted-foreground mt-1.5">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t py-6 px-6 text-xs text-muted-foreground flex items-center justify-between">
        <span>© {new Date().getFullYear()} NSB · Growth by Method</span>
        <span>DEAP Method™ · Confidencial</span>
      </footer>
    </div>
  );
}
