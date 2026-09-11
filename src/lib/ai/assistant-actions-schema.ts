/**
 * Mesmo padrão de UUID de `assistant-screen.ts` -- duplicado deliberadamente (não importado de lá) porque
 * um import de VALOR com alias `@/...` não resolve sob `node --experimental-strip-types` (o alias só é
 * resolvido pelo bundler do Next.js). `import type` (usado nos outros arquivos puros desta fase) é erased
 * em tempo de execução e por isso não sofre esse problema -- aqui precisamos do valor real do regex, não
 * só do tipo. Mesmo padrão RFC 4122 v1-5 usado em toda a base (`field-overview.ts`, `assistant-screen.ts`).
 */
const UUID_EXACT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Fase 4, Bloco 4 — schema fechado de ações do Assistente RAIZ.
 *
 * Auditoria real das rotas antes de aceitar o conjunto sugerido pelo diretor (nunca uma union aceita sem
 * conferir contra o estado real das páginas):
 *
 * - `/mapas` só seleciona por `ordem` (`collection_orders.id`) — não existe parâmetro de `fieldId` na URL
 *   (`agronomic-map-explorer.tsx`, `?ordem=&parametro=&status=&satelite=`). A proposta original tinha
 *   `fieldId` como campo principal; corrigido pra `collectionOrderId`, o que a rota realmente lê. Um talhão
 *   pode ter várias ordens de coleta (safras diferentes) — não existe "a" ordem de um talhão sem
 *   ambiguidade, então quem sugere a ação (o provider) já precisa saber qual ordem, nunca o resolvedor
 *   inventa uma.
 * - `compare_seasons` da proposta original é estruturalmente idêntico a `open_comparison({mode:"seasons"})`
 *   — a rota de destino (`/comparativos?mode=&a=&b=`) é a mesma, só com um nome de campo diferente
 *   (`seasonA`/`seasonB` vs `a`/`b`). Mesclado em `open_comparison` pra não ter duas ações que resolvem
 *   pra rotas idênticas — nenhuma capacidade perdida, `mode:"seasons"` já cobre exatamente esse caso.
 * - `open_report` com `reportType:"field"` usa `id` = ID DA ANÁLISE (`/relatorios/talhao/[analysisId]`),
 *   não do talhão — mesma convenção já usada em `AssistantScreenContext` (`report-field`, `id`).
 * - As demais (`open_analysis`, `open_field`, `filter_intelligence`) batem exatamente com as rotas reais
 *   (`/analises/[id]`, `/talhoes/[id]`, `/inteligencia?...`).
 *
 * Este arquivo é deliberadamente puro (zero import de banco/sessão) — testável com
 * `node --experimental-strip-types`. A verificação de posse/tenant (`validateAssistantAction`,
 * `assistant-actions.ts`) é outro arquivo, porque PRECISA de banco.
 */

export type AssistantAction =
  | { kind: "show_on_map"; collectionOrderId: string; parameter?: string; status?: "all" | "collected" | "pending"; satellite?: boolean }
  | { kind: "open_comparison"; mode: "fields" | "seasons" | "points" | "properties"; a: string; b: string }
  | { kind: "open_analysis"; analysisId: string }
  | { kind: "open_field"; fieldId: string }
  | { kind: "open_report"; reportType: "field" | "property"; id: string }
  | { kind: "filter_intelligence"; interpretationState?: "BLOQUEADA" | "INTERPRETAVEL"; reviewState?: "AGUARDANDO_REVISAO" | "REVISAO_EM_ANDAMENTO" | "APROVADA"; clientId?: string; propertyId?: string; fieldId?: string; seasonId?: string };

/**
 * Nunca `{ href: string_vindo_do_modelo }` — o único jeito de existir um `href` é passando por
 * `resolveActionHref` (abaixo), que só aceita um `AssistantAction` já validado pelo schema fechado.
 */
export type ResolvedAssistantAction = { kind: AssistantAction["kind"]; label: string; description: string; href: string };

const MAP_STATUS = new Set(["all", "collected", "pending"]);
const COMPARISON_MODES = new Set(["fields", "seasons", "points", "properties"]);
const REPORT_TYPES = new Set(["field", "property"]);
const INTERPRETATION_STATES = new Set(["BLOQUEADA", "INTERPRETAVEL"]);
const REVIEW_STATES = new Set(["AGUARDANDO_REVISAO", "REVISAO_EM_ANDAMENTO", "APROVADA"]);
const PARAMETER_CODE = /^[A-Za-z0-9_.-]{1,40}$/; // código de parâmetro laboratorial real (ex.: "P", "K", "pH") -- nunca texto livre longo

/**
 * Validação de FORMATO/allowlist (runtime, não só TypeScript) -- kind desconhecido, enum fora do
 * permitido, ou id fora do formato de uuid devolvem `null` sempre, nunca uma ação parcialmente aceita.
 * NÃO verifica posse/tenant (isso é `assistant-actions.ts`, que precisa de banco) -- só confere que o
 * formato em si é seguro o bastante pra virar uma consulta de verificação.
 */
export function parseAssistantAction(raw: unknown): AssistantAction | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const kind = typeof body.kind === "string" ? body.kind : undefined;
  const str = (key: string): string | undefined => (typeof body[key] === "string" ? (body[key] as string) : undefined);
  const bool = (key: string): boolean | undefined => (typeof body[key] === "boolean" ? (body[key] as boolean) : undefined);
  const isUuid = (v: string | undefined): v is string => v !== undefined && UUID_EXACT.test(v);

  switch (kind) {
    case "show_on_map": {
      const collectionOrderId = str("collectionOrderId");
      if (!isUuid(collectionOrderId)) return null;
      const status = str("status");
      if (status !== undefined && !MAP_STATUS.has(status)) return null;
      const parameter = str("parameter");
      if (parameter !== undefined && !PARAMETER_CODE.test(parameter)) return null;
      const satellite = bool("satellite");
      return { kind: "show_on_map", collectionOrderId, parameter, status: status as "all" | "collected" | "pending" | undefined, satellite };
    }
    case "open_comparison": {
      const mode = str("mode");
      if (!mode || !COMPARISON_MODES.has(mode)) return null;
      const a = str("a");
      const b = str("b");
      if (!isUuid(a) || !isUuid(b)) return null;
      return { kind: "open_comparison", mode: mode as "fields" | "seasons" | "points" | "properties", a, b };
    }
    case "open_analysis": {
      const analysisId = str("analysisId");
      if (!isUuid(analysisId)) return null;
      return { kind: "open_analysis", analysisId };
    }
    case "open_field": {
      const fieldId = str("fieldId");
      if (!isUuid(fieldId)) return null;
      return { kind: "open_field", fieldId };
    }
    case "open_report": {
      const reportType = str("reportType");
      if (!reportType || !REPORT_TYPES.has(reportType)) return null;
      const id = str("id");
      if (!isUuid(id)) return null;
      return { kind: "open_report", reportType: reportType as "field" | "property", id };
    }
    case "filter_intelligence": {
      const interpretationState = str("interpretationState");
      if (interpretationState !== undefined && !INTERPRETATION_STATES.has(interpretationState)) return null;
      const reviewState = str("reviewState");
      if (reviewState !== undefined && !REVIEW_STATES.has(reviewState)) return null;
      const clientId = str("clientId");
      const propertyId = str("propertyId");
      const fieldId = str("fieldId");
      const seasonId = str("seasonId");
      for (const id of [clientId, propertyId, fieldId, seasonId]) {
        if (id !== undefined && !UUID_EXACT.test(id)) return null;
      }
      return {
        kind: "filter_intelligence",
        interpretationState: interpretationState as "BLOQUEADA" | "INTERPRETAVEL" | undefined,
        reviewState: reviewState as "AGUARDANDO_REVISAO" | "REVISAO_EM_ANDAMENTO" | "APROVADA" | undefined,
        clientId, propertyId, fieldId, seasonId,
      };
    }
    default:
      // kind desconhecido -- allowlist fechada, nunca um kind novo aceito por engano.
      return null;
  }
}

/**
 * Constrói label/description/href a partir de um `AssistantAction` JÁ VALIDADO (schema + posse/tenant).
 * Pura string-building -- nunca concatena um valor não validado, sempre via `URLSearchParams` (nunca
 * template literal cru com valor externo direto na query string).
 */
export function resolveActionHref(action: AssistantAction): { label: string; description: string; href: string } {
  switch (action.kind) {
    case "show_on_map": {
      const params = new URLSearchParams();
      params.set("ordem", action.collectionOrderId);
      if (action.parameter) params.set("parametro", action.parameter);
      if (action.status && action.status !== "all") params.set("status", action.status);
      if (action.satellite) params.set("satelite", "1");
      return { label: "Ver no mapa", description: "Abre o mapa já com esta ordem de coleta selecionada", href: `/mapas?${params.toString()}` };
    }
    case "open_comparison": {
      const params = new URLSearchParams({ mode: action.mode, a: action.a, b: action.b });
      return { label: "Ver comparativo", description: "Abre Comparativos com os dois lados já selecionados", href: `/comparativos?${params.toString()}` };
    }
    case "open_analysis":
      return { label: "Ver análise", description: "Abre a análise no cockpit técnico", href: `/analises/${action.analysisId}` };
    case "open_field":
      return { label: "Ver talhão", description: "Abre o Talhão 360°", href: `/talhoes/${action.fieldId}` };
    case "open_report": {
      const href = action.reportType === "field" ? `/relatorios/talhao/${action.id}` : `/relatorios/propriedade/${action.id}`;
      return { label: action.reportType === "field" ? "Ver relatório do talhão" : "Ver relatório da propriedade", description: "Abre o relatório real (publicado, ou o rascunho mais recente se ainda não houver publicação)", href };
    }
    case "filter_intelligence": {
      const params = new URLSearchParams();
      if (action.clientId) params.set("clientId", action.clientId);
      if (action.propertyId) params.set("propertyId", action.propertyId);
      if (action.fieldId) params.set("fieldId", action.fieldId);
      if (action.seasonId) params.set("seasonId", action.seasonId);
      if (action.interpretationState) params.set("interpretationState", action.interpretationState);
      if (action.reviewState) params.set("reviewState", action.reviewState);
      const qs = params.toString();
      return { label: "Ver na fila de Inteligência", description: "Abre a fila já com este filtro aplicado", href: qs ? `/inteligencia?${qs}` : "/inteligencia" };
    }
  }
}
