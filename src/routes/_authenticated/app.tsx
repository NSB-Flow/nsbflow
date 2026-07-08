import { createFileRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Fragment } from "react";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
});

const LABELS: Record<string, string> = {
  app: "Início",
  "deap-meeting": "DEAP Meeting",
  "deap-assessment": "DEAP Assessment",
  empresas: "Empresas",
  pessoas: "Pessoas",
  biblioteca: "Biblioteca",
  academy: "Academy",
  relatorios: "Relatórios",
  historico: "Histórico",
  configuracoes: "Configurações",
  ajuda: "Ajuda",
};

function AppLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const parts = pathname.split("/").filter(Boolean); // ex: ["app","deap-meeting"]
  const crumbs = parts.map((p, i) => ({
    label: LABELS[p] ?? p,
    href: "/" + parts.slice(0, i + 1).join("/"),
    last: i === parts.length - 1,
  }));

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b flex items-center gap-3 px-4 sticky top-0 bg-background/80 backdrop-blur z-10">
            <SidebarTrigger />
            <Breadcrumb>
              <BreadcrumbList>
                {crumbs.map((c, i) => (
                  <Fragment key={c.href}>
                    <BreadcrumbItem>
                      {c.last ? (
                        <BreadcrumbPage>{c.label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink asChild>
                          <Link to={c.href}>{c.label}</Link>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                    {i < crumbs.length - 1 && <BreadcrumbSeparator />}
                  </Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
