import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";
export const Route = createFileRoute("/_authenticated/app/pessoas")({
  head: () => ({ meta: [{ title: "Pessoas — NSB Flow" }] }),
  component: () => <ComingSoon title="Pessoas" description="Stakeholders, contatos e mapa de decisões." />,
});
