import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";
export const Route = createFileRoute("/_authenticated/app/empresas")({
  head: () => ({ meta: [{ title: "Empresas — NSB Flow" }] }),
  component: () => <ComingSoon title="Empresas" description="Base de contas e histórico consolidado por empresa." />,
});
