export type NavItem = {
  href: string;
  label: string;
  icon: "home" | "users" | "map" | "flask" | "file" | "history" | "wallet" | "settings" | "leaf" | "layers" | "location" | "shield" | "sparkles" | "warning" | "upload";
  /** Quando ausente, o item é visível para qualquer perfil autenticado. */
  roles?: string[];
};

export type NavSection = { label: string; items: NavItem[] };

/**
 * Reorganizado em 2026-09-10 (RAIZ 2.0, Fase 1, Etapa 3) pro percurso pedido pelo diretor: CARTEIRA ->
 * TALHÃO -> EVIDÊNCIA -> PRÓXIMA AÇÃO. Nenhuma rota nova foi criada aqui -- é reorganização das mesmas
 * páginas que já existiam (histórico da estrutura anterior, 3 seções + Administração, preservado abaixo
 * pra quem for comparar). As 5 entradas pedidas:
 *
 * 1. Central de Decisão -- painel + clientes + alertas (o que precisa de atenção agora, carteira toda)
 * 2. Talhões -- ponto de entrada único pra explorar/gerenciar um talhão específico
 * 3. Operação -- laudo, laboratório, lista bruta de análises (o trabalho do dia a dia)
 * 4. Inteligência -- as visões já sintetizadas/interpretadas (mapas, histórico, comparativos)
 * 5. Entregas -- o que sai pro cliente final (relatórios)
 *
 * Biblioteca Técnica e Configurações continuam em navegação secundária de gestão (seção Administração,
 * já era assim, só não é uma das 5 entradas principais).
 */
export const navigationSections: NavSection[] = [
  {
    label: "CENTRAL DE DECISÃO",
    items: [
      { href: "/dashboard", label: "Painel", icon: "home" },
      { href: "/clientes", label: "Clientes", icon: "users" },
      { href: "/alertas", label: "Alertas", icon: "warning" },
    ],
  },
  {
    label: "TALHÕES",
    items: [
      { href: "/coletas", label: "Propriedades & Talhões", icon: "map" },
    ],
  },
  {
    label: "OPERAÇÃO",
    items: [
      { href: "/analises", label: "Análises", icon: "flask" },
      { href: "/analises/nova?etapa=laudo", label: "Laboratório", icon: "upload" },
    ],
  },
  {
    label: "INTELIGÊNCIA",
    items: [
      { href: "/inteligencia", label: "Inteligência Agronômica", icon: "sparkles" },
      { href: "/mapas", label: "Mapas", icon: "map" },
      { href: "/historico", label: "Histórico & Evolução", icon: "history" },
      { href: "/comparativos", label: "Comparativos", icon: "layers" },
    ],
  },
  {
    label: "ENTREGAS",
    items: [
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
