export type NavItem = {
  href: string;
  label: string;
  icon: "home" | "users" | "map" | "flask" | "file" | "history" | "wallet" | "settings" | "leaf" | "layers" | "location" | "shield" | "sparkles" | "warning" | "upload";
  /** Quando ausente, o item é visível para qualquer perfil autenticado. */
  roles?: string[];
};

export type NavSection = { label: string; items: NavItem[] };

export const navigationSections: NavSection[] = [
  {
    label: "PRINCIPAL",
    items: [
      { href: "/dashboard", label: "Painel", icon: "home" },
      { href: "/clientes", label: "Clientes", icon: "users" },
      { href: "/coletas#propriedades", label: "Propriedades", icon: "map" },
      { href: "/coletas#talhoes", label: "Talhões", icon: "layers" },
      { href: "/coletas#safras", label: "Safras & Culturas", icon: "leaf" },
      { href: "/coletas", label: "Coletas & Pontos", icon: "location" },
    ],
  },
  {
    label: "LABORATÓRIO E ANÁLISES",
    items: [
      { href: "/analises/nova?etapa=laudo", label: "Laboratório", icon: "upload" },
      { href: "/analises", label: "Análises", icon: "flask" },
      { href: "/inteligencia", label: "Inteligência Agronômica", icon: "sparkles" },
      { href: "/mapas", label: "Mapas", icon: "map" },
    ],
  },
  {
    label: "INTELIGÊNCIA",
    items: [
      { href: "/historico", label: "Histórico & Evolução", icon: "history" },
      { href: "/comparativos", label: "Comparativos", icon: "layers" },
      { href: "/alertas", label: "Alertas", icon: "warning" },
      { href: "/relatorios", label: "Relatórios", icon: "file" },
    ],
  },
  {
    label: "ADMINISTRAÇÃO",
    items: [
      { href: "/biblioteca-tecnica", label: "Biblioteca Técnica", icon: "shield", roles: ["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"] },
      { href: "/configuracoes", label: "Usuários & Permissões", icon: "users", roles: ["SUPER_ADMIN", "TENANT_ADMIN"] },
      { href: "/financeiro", label: "Financeiro", icon: "wallet", roles: ["SUPER_ADMIN", "TENANT_ADMIN", "COMMERCIAL"] },
      { href: "/configuracoes", label: "Configurações", icon: "settings" },
    ],
  },
];

export function visibleNavigationSections(role: string | undefined): NavSection[] {
  return navigationSections
    .map((section) => ({ ...section, items: section.items.filter((item) => !item.roles || (role && item.roles.includes(role))) }))
    .filter((section) => section.items.length > 0);
}
