import { getPlatformSession } from "@/lib/auth/session";
import { parseAssistantScreenContext, parseAssistantScreenState, INVALID_SCREEN_CONTEXT } from "@/lib/ai/assistant-screen";
import { resolveContextLabelLight } from "@/lib/ai/assistant-context-label-light";
import { withQueryCounting } from "@/lib/db-query-count";

/**
 * Fase 4, Bloco 5 — resolve só o RÓTULO contextual (pro cabeçalho do painel do Assistente), sem custo de
 * "perguntar" nada: não grava nenhuma linha em `ai_generations` (não é uma pergunta, é só a tela dizendo
 * "onde estou"), e roda toda vez que o `ScreenContext` muda (abrir o painel, trocar de talhão, etc.) --
 * antes do usuário digitar a primeira pergunta.
 *
 * Fase 4E, Bloco 1 — deixou de chamar `buildAssistantEvidence` completo (o Evidence Package inteiro, com
 * todas as consultas que uma RESPOSTA real precisa) só pra extrair um rótulo. Usa `resolveContextLabelLight`
 * (`assistant-context-label-light.ts`), que resolve o mesmo texto com a consulta mínima necessária (0
 * consultas pros rótulos estáticos, 1 consulta simples pros que dependem de uma entidade real) --
 * documentado com números reais em `docs/RAIZ_2.0_FASE4E_PRE_LLM.md`. Mesma sessão/tenant/RBAC de sempre --
 * nunca um caminho mais permissivo só porque é "só o rótulo".
 *
 * `x-debug-query-count: 1` (nunca enviado pelo client real, só pelos testes de medição) inclui
 * `_debugQueryCount` na resposta -- nunca afeta o contrato normal.
 */
export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const parsedContext = parseAssistantScreenContext(body.screenContext);
  const screenState = parseAssistantScreenState(body.screenState);

  if (parsedContext === INVALID_SCREEN_CONTEXT) {
    return Response.json({ label: null, valid: false });
  }

  const debug = request.headers.get("x-debug-query-count") === "1";
  const { result: label, queryCount } = await withQueryCounting(() => resolveContextLabelLight(session.tenantId, session.userId, parsedContext, screenState));
  return Response.json({ label, valid: label !== null, ...(debug ? { _debugQueryCount: queryCount } : {}) });
}
