import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  MessagesSquare,
  ClipboardCheck,
  Building2,
  Users,
  BookOpen,
  GraduationCap,
  BarChart3,
  History,
  Settings,
  HelpCircle,
  LogOut,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NsbLogo } from "@/components/brand/NsbLogo";
import { useAuth } from "@/lib/auth-context";
import { canAccess, type ModuleKey } from "@/lib/roles";
import { supabase } from "@/integrations/supabase/client";

type Item = {
  key: ModuleKey;
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  group: "principal" | "sistema";
  soon?: boolean;
};

const ITEMS: Item[] = [
  { key: "dashboard", title: "Dashboard", url: "/app", icon: LayoutDashboard, group: "principal" },
  { key: "deap-meeting", title: "DEAP Meeting", url: "/app/deap-meeting", icon: MessagesSquare, group: "principal" },
  { key: "deap-assessment", title: "DEAP Assessment", url: "/app/deap-assessment", icon: ClipboardCheck, group: "principal", soon: true },
  { key: "empresas", title: "Empresas", url: "/app/empresas", icon: Building2, group: "principal", soon: true },
  { key: "pessoas", title: "Pessoas", url: "/app/pessoas", icon: Users, group: "principal", soon: true },
  { key: "biblioteca", title: "Biblioteca", url: "/app/biblioteca", icon: BookOpen, group: "principal", soon: true },
  { key: "academy", title: "Academy", url: "/app/academy", icon: GraduationCap, group: "principal", soon: true },
  { key: "relatorios", title: "Relatórios", url: "/app/relatorios", icon: BarChart3, group: "principal", soon: true },
  { key: "historico", title: "Histórico", url: "/app/historico", icon: History, group: "sistema" },
  { key: "configuracoes", title: "Configurações", url: "/app/configuracoes", icon: Settings, group: "sistema" },
  { key: "ajuda", title: "Ajuda", url: "/app/ajuda", icon: HelpCircle, group: "sistema", soon: true },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { roles, fullName, user } = useAuth();

  const visible = ITEMS.filter((it) => roles.length === 0 || canAccess(roles, it.key));
  const principal = visible.filter((i) => i.group === "principal");
  const sistema = visible.filter((i) => i.group === "sistema");

  const isActive = (url: string) =>
    url === "/app" ? pathname === "/app" : pathname.startsWith(url);

  const initials = (fullName ?? user?.email ?? "N")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b h-14 px-3 flex-row items-center gap-2">
        <NsbLogo collapsed={collapsed} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {principal.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && (
                        <span className="flex-1 flex items-center gap-2">
                          {item.title}
                          {item.soon && (
                            <span className="text-[9px] uppercase tracking-wider text-muted-foreground border rounded px-1 py-px">
                              em breve
                            </span>
                          )}
                        </span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Sistema</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sistema.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && (
                        <span className="flex-1 flex items-center gap-2">
                          {item.title}
                          {item.soon && (
                            <span className="text-[9px] uppercase tracking-wider text-muted-foreground border rounded px-1 py-px">
                              em breve
                            </span>
                          )}
                        </span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={fullName ?? user?.email ?? ""}>
              <Link to="/app/configuracoes" className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">
                      {fullName ?? user?.email}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {roles[0] ?? "usuário"}
                    </div>
                  </div>
                )}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Sair"
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/auth";
              }}
            >
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Sair</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
