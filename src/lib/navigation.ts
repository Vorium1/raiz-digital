export type NavItem = {
  href: string;
  label: string;
  icon: "home" | "users" | "map" | "flask" | "file" | "history" | "wallet" | "settings" | "leaf" | "layers" | "location" | "shield" | "sparkles" | "warning" | "upload";
  /** Quando ausente, o item é visível para qualquer perfil autenticado. */
  roles?: string[];
};

export type NavSection = { label: string; items: NavItem[] };

/**
 * Estrutura revista em 2026-09-08 pra ficar mais perto do conceito visual aprovado (3 seções pra quem não
 * é admin: Painel/Operação/Inteligência, só Administração aparece a mais pra quem tem o papel).
 * "Propriedades", "Talhões", "Safras & Culturas" e "Coletas & Pontos" eram 4 itens de menu que já
 * apontavam pra MESMA página (`/coletas`, só com âncora diferente) -- viraram 1 item só
 * ("Propriedades & Talhões") depois que o painel de lista+mapa (`PropertiesFieldsBrowser`) passou a cobrir
 * essa navegação de verdade lá dentro da própria página, tornando as âncoras redundantes. Nenhuma página
 * foi removida -- é só o menu que ficou mais enxuto refletindo o que já é a mesma tela.
 */
export const navigationSections: NavSection[] = [
  {
    label: "PAINEL",
    items: [
      { href: "/dashboard", label: "Painel", icon: "home" },
    ],
  },
  {
    label: "OPERAÇÃO",
    items: [
      { href: "/clientes", label: "Clientes", icon: "users" },
      { href: "/coletas", label: "Propriedades & Talhões", icon: "map" },
      { href: "/analises/nova?etapa=laudo", label: "Laboratório", icon: "upload" },
    ],
  },
  {
    label: "INTELIGÊNCIA",
    items: [
      { href: "/analises", label: "Análises", icon: "flask" },
      { href: "/inteligencia", label: "Inteligência Agronômica", icon: "sparkles" },
      { href: "/mapas", label: "Mapas", icon: "map" },
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
      { href: "/configuracoes#equipe", label: "Usuários & Permissões", icon: "users", roles: ["SUPER_ADMIN", "TENANT_ADMIN"] },
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
