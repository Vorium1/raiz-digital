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

// ---------------------------------------------------------------------------------------------
// Fechamento técnico (2º pedido, item 2) -- parsing do CORPO da requisição de /api/assistant,
// server-side. Diferente de `inferScreenContext`/`inferScreenState` acima (que leem a URL real do
// client): aqui o servidor nunca confia no que o corpo diz ser verdade -- só decide se o formato é
// reconhecível.
//
// Correção do diretor: contexto inválido/malformado NÃO pode virar `{ type: "dashboard" }` silenciosamente
// -- isso faria a RAIZ responder sobre a operação inteira quando, na verdade, a tela de origem está com um
// problema real (id malformado, tipo desconhecido). As 3 situações são diferentes:
//   1. Ausência legítima (corpo não mandou `screenContext` nenhum, ex.: tela sem inferência de contexto
//      hoje) -> contexto global apropriado (`{ type: "dashboard" }`) é uma escolha correta aqui.
//   2. Tela Dashboard real (`{ type: "dashboard" }` explícito) -> `{ type: "dashboard" }`, trivialmente.
//   3. Contexto explicitamente informado, mas o tipo não é reconhecido OU o id exigido está ausente/não
//      bate o formato de uuid -> `"invalid"` (fail closed) -- nunca vira Dashboard.
// ---------------------------------------------------------------------------------------------

const VALID_CONTEXT_TYPES = new Set(["dashboard", "property", "field", "analysis", "intelligence", "map", "comparison", "report-field", "report-property"]);
const ID_REQUIRED_TYPES = new Set(["property", "field", "analysis", "report-field", "report-property"]);
const UUID_EXACT = new RegExp(`^${UUID}$`, "i");

/** Sentinela explícita -- nunca confundida com um `AssistantScreenContext` real. */
export const INVALID_SCREEN_CONTEXT = "invalid" as const;

export function parseAssistantScreenContext(raw: unknown): AssistantScreenContext | typeof INVALID_SCREEN_CONTEXT {
  // Ausência legítima (nada enviado) -- contexto global apropriado, não é um erro.
  if (raw === undefined || raw === null) return { type: "dashboard" };
  if (typeof raw !== "object") return INVALID_SCREEN_CONTEXT;
  const body = raw as Record<string, unknown>;
  const type = typeof body.type === "string" ? body.type : undefined;
  if (!type || !VALID_CONTEXT_TYPES.has(type)) return INVALID_SCREEN_CONTEXT;
  if (!ID_REQUIRED_TYPES.has(type)) return { type } as AssistantScreenContext;
  const id = typeof body.id === "string" ? body.id : undefined;
  if (!id || !UUID_EXACT.test(id)) return INVALID_SCREEN_CONTEXT;
  return { type, id: id.toLowerCase() } as AssistantScreenContext;
}

export function parseAssistantScreenState(raw: unknown): AssistantScreenState | undefined {
  if (raw === undefined || raw === null || typeof raw !== "object") return undefined;
  const body = raw as Record<string, unknown>;
  const screen = typeof body.screen === "string" ? body.screen : undefined;
  const str = (key: string) => (typeof body[key] === "string" ? (body[key] as string) : undefined);
  if (screen === "map") {
    const status = str("status");
    return { screen: "map", collectionOrderId: str("collectionOrderId"), parameter: str("parameter"), status: status === "collected" || status === "pending" || status === "all" ? status : undefined, satellite: body.satellite === true };
  }
  if (screen === "comparison") {
    const mode = str("mode");
    return { screen: "comparison", mode: mode === "fields" || mode === "seasons" || mode === "points" || mode === "properties" ? mode : undefined, a: str("a"), b: str("b") };
  }
  if (screen === "intelligence") {
    return { screen: "intelligence", clientId: str("clientId"), propertyId: str("propertyId"), fieldId: str("fieldId"), seasonId: str("seasonId"), interpretationState: str("interpretationState"), reviewState: str("reviewState") };
  }
  return undefined;
}
