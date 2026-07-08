import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";
export const Route = createFileRoute("/_authenticated/app/biblioteca")({
  head: () => ({ meta: [{ title: "Biblioteca — NSB Flow" }] }),
  component: () => <ComingSoon title="Biblioteca" description="Materiais, playbooks e frameworks do DEAP Method™." />,
});
