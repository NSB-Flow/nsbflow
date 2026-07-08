import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";
export const Route = createFileRoute("/_authenticated/app/ajuda")({
  head: () => ({ meta: [{ title: "Ajuda — NSB Flow" }] }),
  component: () => <ComingSoon title="Central de Ajuda" description="Documentação, tutoriais e suporte." />,
});
