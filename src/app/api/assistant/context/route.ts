import { getPlatformSession } from "@/lib/auth/session";
import { parseAssistantScreenContext, parseAssistantScreenState, INVALID_SCREEN_CONTEXT } from "@/lib/ai/assistant-screen";
import { buildAssistantEvidence } from "@/lib/ai/assistant-evidence";
import { deriveContextLabel } from "@/lib/ai/assistant-context-label";

/**
 * Fase 4, Bloco 5 — resolve só o RÓTULO contextual (pro cabeçalho do painel do Assistente), sem custo de
 * "perguntar" nada: não grava nenhuma linha em `ai_generations` (não é uma pergunta, é só a tela dizendo
 * "onde estou"), e roda toda vez que o `ScreenContext` muda (abrir o painel, trocar de talhão, etc.) --
 * antes do usuário digitar a primeira pergunta.
 *
 * Mesma validação de tenant/RBAC de `/api/assistant` (mesma sessão, mesmo `buildAssistantEvidence`) --
 * nunca um caminho mais permissivo só porque é "só o rótulo".
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

  const evidence = await buildAssistantEvidence(session.tenantId, session.userId, parsedContext, screenState);
  const label = deriveContextLabel(evidence);
  return Response.json({ label, valid: label !== null });
}
