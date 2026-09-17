export type NavItem = {
  href: string;
  label: string;
  icon: "home" | "users" | "map" | "flask" | "file" | "history" | "wallet" | "settings" | "leaf" | "layers" | "location" | "shield" | "sparkles" | "warning" | "upload";
  /** Quando ausente, o item é visível para qualquer perfil autenticado. */
  roles?: string[];
  /** Recurso global da plataforma, não apenas administrativo dentro de um tenant. */
  platformCuratorOnly?: boolean;
};

export type NavSection = { label: string; items: NavItem[] };

/**
 * RAIZ UX 2.0 — a navegação deixa de espelhar módulos internos e passa a seguir a jornada real:
 * receber dados -> processar/analisar -> revisar -> entregar. Rotas técnicas continuam existindo,
 * mas ficam agrupadas de acordo com o trabalho que o usuário quer concluir.
 */
export const navigationSections: NavSection[] = [
  {
    label: "FLUXO PRINCIPAL",
    items: [
      { href: "/inicio", label: "Início", icon: "home" },
      { href: "/analises/nova?etapa=laudo&nivel=interpretacao-rapida", label: "Enviar dados", icon: "upload" },
      { href: "/analises", label: "Operações", icon: "flask" },
      { href: "/analises?status=revisao", label: "Revisões", icon: "shield", roles: ["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"] },
      { href: "/relatorios", label: "Entregas", icon: "file" },
    ],
  },
  {
    label: "CAMPO",
    items: [
      { href: "/mapas", label: "Mapa", icon: "map" },
      { href: "/coletas", label: "Talhões & Coletas", icon: "layers" },
      { href: "/alertas", label: "Alertas", icon: "warning" },
    ],
  },
  {
    label: "GESTÃO",
    items: [
      { href: "/clientes", label: "Clientes", icon: "users" },
      { href: "/inteligencia", label: "Inteligência Agronômica", icon: "sparkles" },
      { href: "/historico", label: "Histórico", icon: "history" },
      { href: "/comparativos", label: "Comparativos", icon: "layers" },
    ],
  },
  {
    label: "ADMINISTRAÇÃO",
    items: [
      { href: "/biblioteca-tecnica", label: "Biblioteca Técnica", icon: "shield", roles: ["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"] },
      { href: "/configuracoes#equipe", label: "Usuários & Permissões", icon: "users", roles: ["SUPER_ADMIN", "TENANT_ADMIN"] },
      { href: "/operacao-sistema", label: "Saúde do sistema", icon: "shield", platformCuratorOnly: true },
      { href: "/financeiro", label: "Financeiro", icon: "wallet", roles: ["SUPER_ADMIN", "TENANT_ADMIN", "COMMERCIAL"] },
      { href: "/configuracoes", label: "Configurações", icon: "settings" },
    ],
  },
];

export function visibleNavigationSections(role: string | undefined, isPlatformCurator = false): NavSection[] {
  return navigationSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.platformCuratorOnly && !isPlatformCurator) return false;
        return !item.roles || Boolean(role && item.roles.includes(role));
      }),
    }))
    .filter((section) => section.items.length > 0);
}
