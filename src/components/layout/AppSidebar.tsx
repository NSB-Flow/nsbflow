import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, MessagesSquare, ClipboardCheck, Building2, Users, BookOpen,
  GraduationCap, BarChart3, History, Settings, HelpCircle, LogOut,
  CreditCard, Sparkles, ChevronsUpDown, Check, Plus, Shield, Gift,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NsbLogo } from "@/components/brand/NsbLogo";
import { useAuth } from "@/lib/auth-context";
import { canAccess, type ModuleKey } from "@/lib/roles";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import { useEntitlements, type FeatureKey } from "@/lib/entitlements";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

type Item = {
  key: ModuleKey;
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  group: "principal" | "billing" | "sistema";
  feature?: FeatureKey;
  soon?: boolean;
};

const ITEMS: Item[] = [
  { key: "dashboard", title: "Dashboard", url: "/app", icon: LayoutDashboard, group: "principal" },
  { key: "deap-meeting", title: "DEAP Meeting", url: "/app/deap-meeting", icon: MessagesSquare, group: "principal", feature: "deap.meeting.briefing" },
  { key: "deap-assessment", title: "DEAP Assessment", url: "/app/deap-assessment", icon: ClipboardCheck, group: "principal", feature: "deap.assessment.sales" },
  { key: "empresas", title: "Empresas", url: "/app/empresas", icon: Building2, group: "principal", soon: true },
  { key: "pessoas", title: "Pessoas", url: "/app/pessoas", icon: Users, group: "principal", soon: true },
  { key: "biblioteca", title: "Biblioteca", url: "/app/biblioteca", icon: BookOpen, group: "principal", soon: true },
  { key: "academy", title: "Academy", url: "/app/academy", icon: GraduationCap, group: "principal", soon: true },
  { key: "relatorios", title: "Relatórios", url: "/app/relatorios", icon: BarChart3, group: "principal", soon: true },
  { key: "historico", title: "Histórico", url: "/app/historico", icon: History, group: "principal" },

  { key: "equipe", title: "Equipe", url: "/app/equipe", icon: Users, group: "billing" },
  { key: "assinatura", title: "Minha Assinatura", url: "/app/assinatura", icon: CreditCard, group: "billing" },
  { key: "planos", title: "Planos", url: "/app/planos", icon: Sparkles, group: "billing" },
  { key: "indicacoes", title: "Indicações", url: "/app/indicacoes", icon: Gift, group: "billing" },

  { key: "configuracoes", title: "Configurações", url: "/app/configuracoes", icon: Settings, group: "sistema" },
  { key: "ajuda", title: "Ajuda", url: "/app/ajuda", icon: HelpCircle, group: "sistema", soon: true },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { roles, fullName, user } = useAuth();
  const { workspace, workspaces, switchWorkspace } = useWorkspace();
  const ent = useEntitlements();

  const visible = ITEMS.filter((it) => {
    if (roles.length && !canAccess(roles, it.key)) return false;
    if (it.feature && !ent.loading && !ent.has(it.feature)) return false;
    return true;
  });
  const principal = visible.filter((i) => i.group === "principal");
  const billing = visible.filter((i) => i.group === "billing");
  const sistema = visible.filter((i) => i.group === "sistema");

  const isActive = (url: string) => (url === "/app" ? pathname === "/app" : pathname.startsWith(url));
  const isSuperAdmin = roles.includes("super_admin");

  const initials = (fullName ?? user?.email ?? "N").split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b h-14 px-3 flex-row items-center gap-2">
        <NsbLogo collapsed={collapsed} />
      </SidebarHeader>

      {!collapsed && workspaces.length > 0 && (
        <div className="p-2 border-b">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60 text-left">
                <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-muted-foreground">Workspace</div>
                  <div className="text-sm font-medium truncate">{workspace?.name ?? "—"}</div>
                </div>
                <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {workspaces.map((w) => (
                <DropdownMenuItem key={w.id} onClick={() => switchWorkspace(w.id)}>
                  <Building2 className="h-3.5 w-3.5 mr-2" />
                  <span className="flex-1 truncate">{w.name}</span>
                  {w.id === workspace?.id && <Check className="h-3.5 w-3.5 text-gold" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/app/workspaces"><Plus className="h-3.5 w-3.5 mr-2" /> Criar / gerenciar</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <SidebarContent>
        {ent.isTrialing && !collapsed && (
          <div className="mx-2 mt-2 rounded-md border border-gold/40 bg-gold/10 p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-gold font-medium">Trial</div>
            <div className="text-xs mt-0.5">Restam {ent.trialDaysLeft} dia(s)</div>
            <Link to="/app/planos" className="text-[11px] text-primary hover:underline">Escolher plano →</Link>
          </div>
        )}

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
                          {item.soon && <span className="text-[9px] uppercase tracking-wider text-muted-foreground border rounded px-1 py-px">em breve</span>}
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
          <SidebarGroupLabel>Assinatura</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {billing.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
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
                          {item.soon && <span className="text-[9px] uppercase tracking-wider text-muted-foreground border rounded px-1 py-px">em breve</span>}
                        </span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {isSuperAdmin && (
                <>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Super Admin" isActive={isActive("/app/admin")}>
                      <Link to="/app/admin" className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-gold" />
                        {!collapsed && <span className="text-gold">Super Admin</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Auditoria" isActive={isActive("/app/admin-security")}>
                      <Link to="/app/admin-security" className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-gold" />
                        {!collapsed && <span className="text-gold">Auditoria</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
              )}
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
                  <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">{initials}</AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{fullName ?? user?.email}</div>
                    <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                      {roles[0] ?? "usuário"}
                      {ent.planTier && <Badge variant="outline" className="h-3.5 px-1 text-[9px] uppercase">{ent.planTier}</Badge>}
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
