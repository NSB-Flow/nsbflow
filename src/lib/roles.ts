export type AppRole =
  | "admin"
  | "ceo"
  | "diretor"
  | "gerente"
  | "coordenador"
  | "vendedor"
  | "consultor"
  | "sdr";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador",
  ceo: "CEO",
  diretor: "Diretor",
  gerente: "Gerente",
  coordenador: "Coordenador",
  vendedor: "Vendedor",
  consultor: "Consultor",
  sdr: "SDR",
};

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
  | "ajuda";

/** Módulos visíveis por perfil. Admin/CEO/Diretor: tudo. */
export const MODULE_ACCESS: Record<AppRole, ModuleKey[] | "*"> = {
  admin: "*",
  ceo: "*",
  diretor: "*",
  gerente: [
    "dashboard",
    "deap-meeting",
    "deap-assessment",
    "empresas",
    "pessoas",
    "biblioteca",
    "academy",
    "relatorios",
    "historico",
    "ajuda",
  ],
  coordenador: [
    "dashboard",
    "deap-meeting",
    "deap-assessment",
    "empresas",
    "pessoas",
    "biblioteca",
    "academy",
    "relatorios",
    "historico",
    "ajuda",
  ],
  vendedor: [
    "dashboard",
    "deap-meeting",
    "empresas",
    "biblioteca",
    "academy",
    "historico",
    "ajuda",
  ],
  consultor: [
    "dashboard",
    "deap-meeting",
    "deap-assessment",
    "empresas",
    "biblioteca",
    "academy",
    "historico",
    "ajuda",
  ],
  sdr: ["dashboard", "deap-meeting", "empresas", "biblioteca", "academy", "historico", "ajuda"],
};

export function canAccess(roles: AppRole[], module: ModuleKey): boolean {
  return roles.some((r) => {
    const access = MODULE_ACCESS[r];
    return access === "*" || access.includes(module);
  });
}
