/**
 * Fase 4A, Bloco 1 — contexto de tela do Assistente RAIZ.
 *
 * Correção do diretor (arquitetura revisada, docs/RAIZ_2.0_FASE4_ARQUITETURA_ASSISTENTE.md, seção 4.3):
 * `ScreenContext` (qual entidade/tela) e `ScreenState` (filtros/seleções visíveis naquele momento) são
 * conceitos DIFERENTES, não um objeto só.
 *
 * - `AssistantScreenContext` muda pouco durante o uso e decide QUAL Evidence Package Builder roda
 *   (`src/lib/ai/assistant-evidence.ts`).
 * - `AssistantScreenState` é o filtro/seleção que já vive na URL de cada tela (mesmo mecanismo usado por
 *   `agronomic-map-explorer.tsx`, `comparison-explorer.tsx`, `intelligence-queue-filters.tsx`) — o client
 *   pode mandar esses valores porque não são segredo (já estão visíveis na própria URL), mas o SERVIDOR
 *   nunca trata um valor de `ScreenState` como autorização: todo id sensível dentro dele é revalidado
 *   contra tenant/RBAC antes de entrar em qualquer Evidence Package (ver `assistant-evidence.ts`).
 *
 * Este arquivo é deliberadamente puro (zero import de banco/sessão) para poder ser testado com
 * `node --experimental-strip-types` sem precisar de banco real.
 */

export type AssistantScreenContext =
  | { type: "dashboard" }
  | { type: "property"; id: string }
  | { type: "field"; id: string }
  | { type: "analysis"; id: string }
  | { type: "intelligence" }
  | { type: "map" }
  | { type: "comparison" }
  | { type: "report-field"; id: string }
  | { type: "report-property"; id: string };

export type AssistantScreenState =
  | { screen: "map"; collectionOrderId?: string; parameter?: string; status?: "all" | "collected" | "pending"; satellite?: boolean }
  | { screen: "comparison"; mode?: "fields" | "seasons" | "points" | "properties"; a?: string; b?: string }
  | { screen: "intelligence"; clientId?: string; propertyId?: string; fieldId?: string; seasonId?: string; interpretationState?: string; reviewState?: string };

/** Mesmo padrão de UUID já usado em `src/lib/repositories/field-overview.ts` (RFC 4122 v1-5). */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

type RoutePattern = { pattern: RegExp; build: (match: RegExpMatchArray) => AssistantScreenContext };

/**
 * Tabela de padrões de rota -> contexto, testada em ordem contra o `pathname`. Cobre exatamente as rotas
 * reais do app (`src/app/(platform)/...`) — nenhuma inventada. `property` não tem entrada aqui porque não
 * existe hoje uma página própria de propriedade (só o relatório executivo, coberto por `report-property`)
 * — o tipo continua disponível na union pra uso explícito futuro, sem fingir que existe uma rota pra ele.
 */
const ROUTE_PATTERNS: RoutePattern[] = [
  { pattern: /^\/dashboard\/?$/i, build: () => ({ type: "dashboard" }) },
  { pattern: new RegExp(`^/analises/(${UUID})/?$`, "i"), build: (m) => ({ type: "analysis", id: m[1].toLowerCase() }) },
  { pattern: new RegExp(`^/talhoes/(${UUID})/?$`, "i"), build: (m) => ({ type: "field", id: m[1].toLowerCase() }) },
  { pattern: new RegExp(`^/relatorios/talhao/(${UUID})/?$`, "i"), build: (m) => ({ type: "report-field", id: m[1].toLowerCase() }) },
  { pattern: new RegExp(`^/relatorios/propriedade/(${UUID})/?$`, "i"), build: (m) => ({ type: "report-property", id: m[1].toLowerCase() }) },
  { pattern: /^\/mapas\/?$/i, build: () => ({ type: "map" }) },
  { pattern: /^\/comparativos\/?$/i, build: () => ({ type: "comparison" }) },
  { pattern: /^\/inteligencia\/?$/i, build: () => ({ type: "intelligence" }) },
];

export function inferScreenContext(pathname: string): AssistantScreenContext | undefined {
  for (const { pattern, build } of ROUTE_PATTERNS) {
    const match = pathname.match(pattern);
    if (match) return build(match);
  }
  return undefined;
}

type SearchParamsLike = { get(key: string): string | null };

/**
 * Lê o `ScreenState` real já presente na URL de cada tela — os MESMOS nomes de parâmetro que
 * `agronomic-map-explorer.tsx`/`comparison-explorer.tsx`/`intelligence-queue-filters.tsx` já leem, nunca
 * um contrato novo e paralelo.
 */
export function inferScreenState(pathname: string, searchParams: SearchParamsLike): AssistantScreenState | undefined {
  if (/^\/mapas\/?$/i.test(pathname)) {
    const status = searchParams.get("status");
    return {
      screen: "map",
      collectionOrderId: searchParams.get("ordem") ?? undefined,
      parameter: searchParams.get("parametro") ?? undefined,
      status: status === "collected" || status === "pending" ? status : status === "all" ? "all" : undefined,
      satellite: searchParams.get("satelite") === "1",
    };
  }
  if (/^\/comparativos\/?$/i.test(pathname)) {
    const mode = searchParams.get("mode");
    return {
      screen: "comparison",
      mode: mode === "fields" || mode === "seasons" || mode === "points" || mode === "properties" ? mode : undefined,
      a: searchParams.get("a") ?? undefined,
      b: searchParams.get("b") ?? undefined,
    };
  }
  if (/^\/inteligencia\/?$/i.test(pathname)) {
    return {
      screen: "intelligence",
      clientId: searchParams.get("clientId") ?? undefined,
      propertyId: searchParams.get("propertyId") ?? undefined,
      fieldId: searchParams.get("fieldId") ?? undefined,
      seasonId: searchParams.get("seasonId") ?? undefined,
      interpretationState: searchParams.get("interpretationState") ?? undefined,
      reviewState: searchParams.get("reviewState") ?? undefined,
    };
  }
  return undefined;
}
