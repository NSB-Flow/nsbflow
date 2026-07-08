import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";
export const Route = createFileRoute("/_authenticated/app/deap-assessment")({
  head: () => ({ meta: [{ title: "DEAP Assessment — NSB Flow" }] }),
  component: () => <ComingSoon title="DEAP Assessment" description="Avaliação de maturidade comercial e desenvolvimento organizacional." />,
});
