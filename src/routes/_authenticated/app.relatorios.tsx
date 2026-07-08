import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";
export const Route = createFileRoute("/_authenticated/app/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — NSB Flow" }] }),
  component: () => <ComingSoon title="Relatórios" description="Indicadores agregados e relatórios executivos." />,
});
