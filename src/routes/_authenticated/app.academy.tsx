import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";
export const Route = createFileRoute("/_authenticated/app/academy")({
  head: () => ({ meta: [{ title: "Academy — NSB Flow" }] }),
  component: () => <ComingSoon title="NSB Academy" description="Trilhas de desenvolvimento e certificações NSB." />,
});
