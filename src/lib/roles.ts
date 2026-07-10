export type AppRole =
  | "super_admin"
  | "admin"
  | "admin_empresa"
  | "ceo"
  | "diretor"
  | "gerente"
  | "coordenador"
  | "vendedor"
  | "consultor"
  | "sdr"
  | "cliente";

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Administrador",
  admin: "Administrador",
  admin_empresa: "Administrador da Empresa",
  ceo: "CEO",
  diretor: "Diretor",
  gerente: "Gerente",
  coordenador: "Coordenador",
  vendedor: "Vendedor",
  consultor: "Consultor",
  sdr: "SDR",
  cliente: "Cliente",
};

export const ROLE_ORDER: AppRole[] = [
  "super_admin",
  "admin",
  "admin_empresa",
  "ceo",
  "diretor",
  "gerente",
  "coordenador",
  "consultor",
  "vendedor",
  "sdr",
  "cliente",
];

export type ModuleKey =
  | "dashboard"
  | "deap-meeting"
  | "deap-assessment"
  | "empresas"
  | "pessoas"
  | "biblioteca"
  | "academy"
  | "relatorios"
  | "historico"
  | "configuracoes"
  | "equipe"
  | "assinatura"
  | "planos"
  | "workspaces"
  | "ajuda"
  | "admin"
  | "indicacoes";

/** Módulos visíveis por perfil. Roles administrativos: tudo. */
export const MODULE_ACCESS: Record<AppRole, ModuleKey[] | "*"> = {
  super_admin: "*",
  admin: "*",
  admin_empresa: "*",
  ceo: "*",
  diretor: "*",
  gerente: [
    "dashboard", "deap-meeting", "deap-assessment", "empresas", "pessoas",
    "biblioteca", "academy", "relatorios", "historico", "equipe",
    "assinatura", "planos", "workspaces", "ajuda", "indicacoes",
  ],
  coordenador: [
    "dashboard", "deap-meeting", "deap-assessment", "empresas", "pessoas",
    "biblioteca", "academy", "relatorios", "historico", "workspaces", "ajuda",
  ],
  consultor: [
    "dashboard", "deap-meeting", "deap-assessment", "empresas", "biblioteca",
    "academy", "historico", "workspaces", "ajuda",
  ],
  vendedor: [
    "dashboard", "deap-meeting", "empresas", "biblioteca", "academy",
    "historico", "workspaces", "ajuda",
  ],
  sdr: [
    "dashboard", "deap-meeting", "empresas", "biblioteca", "academy",
    "historico", "workspaces", "ajuda",
  ],
  cliente: ["dashboard", "historico", "ajuda"],
};

export function canAccess(roles: AppRole[], module: ModuleKey): boolean {
  return roles.some((r) => {
    const access = MODULE_ACCESS[r];
    return access === "*" || access.includes(module);
  });
}

export function isAdminRole(role: AppRole): boolean {
  return ["super_admin", "admin", "admin_empresa", "ceo", "diretor"].includes(role);
}
