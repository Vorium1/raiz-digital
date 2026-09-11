import { getPlatformSession } from "@/lib/auth/session";
import { routeAssistantRequest, type AssistantMode } from "@/lib/ai/assistant-provider-router";
import type { OperationalAssistantProvider, OperationalAssistantResponse } from "@/lib/ai/operational-assistant-provider";
import type { AssistantEvidenceResult } from "@/lib/ai/assistant-evidence";
import type { AssistantScreenContext, AssistantScreenState } from "@/lib/ai/assistant-screen";

/**
 * Fase 4G, item 10 — testa `routeAssistantRequest` (`assistant-provider-router.ts`) contra um provider
 * generativo FAKE, nunca o Gemini real -- "Não gastar cota real do Gemini nos testes normais. Mock/stub
 * para falhas de infraestrutura." NUNCA disponível em produção (mesmo padrão de
 * `/api/dev/assistant-benchmark`), sempre autenticado (usa a sessão real -- `checkGenerativeUsageLimit`
 * consulta `ai_generations` de verdade pra este tenant/usuário, nunca um caminho especial de teste).
 *
 * `fakeGenerativeBehavior` escolhe o comportamento do provider generativo injetado nesta chamada:
 * - `"success"` — devolve uma resposta bem fundamentada, passa no Grounding Gate.
 * - `"error_429"`/`"error_503"`/`"invalid_json"` — lança um erro (mesma forma que qualquer falha real de
 *   infraestrutura produziria) -- o router precisa cair no fallback local em todos os 3 casos.
 * - `"timeout"` — nunca resolve (fica pendurado) -- prova o timeout do router (`options.timeoutMs`, curto
 *   nesta rota de teste pra não segurar o teste por 15s de verdade).
 * - `"grounding_fail"` — devolve uma resposta com `summary` NÃO fundamentado (uuid inventado) -- prova que
 *   o Grounding Gate reprova e cai no fallback, mesmo com o provider "respondendo com sucesso".
 * - `"malicious_href"` — tenta devolver `cards`/`suggested_actions` com conteúdo malicioso -- prova que
 *   nada disso sobrevive na resposta final (mesmo quando o resto da resposta passa no gate).
 * - `"none"` — nenhum provider generativo injetado (simula ausência total de provider externo).
 */

const REAL_FIELD_ID = "00000000-0000-4000-8000-000000000001";

function fakeResponse(overrides: Partial<OperationalAssistantResponse>): OperationalAssistantResponse {
  return {
    summary: "Resumo padrão de teste.",
    facts: [], attention_points: [], patterns: [], hypotheses: [], missing_information: [], technical_references: [], suggested_actions: [],
    requires_professional_review: false, cards: [],
    suggestedQuestions: [], provider: "fake-generative", model: "fake-model", isRealLanguageModel: true, generatedAt: new Date().toISOString(), handling: "handled",
    ...overrides,
  };
}

function buildFakeProvider(behavior: string): OperationalAssistantProvider | null | "timeout" {
  switch (behavior) {
    case "success":
      return { name: "fake-generative", model: "fake-model", isRealLanguageModel: true, async ask() { return fakeResponse({ summary: "Este talhão tem histórico normal, sem pendências identificadas na evidência servida." }); } };
    case "error_429":
      return { name: "fake-generative", model: "fake-model", isRealLanguageModel: true, async ask() { throw new Error("429 RESOURCE_EXHAUSTED (simulado)"); } };
    case "error_503":
      return { name: "fake-generative", model: "fake-model", isRealLanguageModel: true, async ask() { throw new Error("503 UNAVAILABLE (simulado)"); } };
    case "invalid_json":
      return { name: "fake-generative", model: "fake-model", isRealLanguageModel: true, async ask() { throw new Error("Resposta da IA não é um JSON válido (simulado)"); } };
    case "timeout":
      return "timeout"; // tratado no caller -- devolve uma Promise que nunca resolve
    case "grounding_fail":
      return { name: "fake-generative", model: "fake-model", isRealLanguageModel: true, async ask() { return fakeResponse({ summary: "Veja também o talhão 99999999-9999-4999-8999-999999999999, id que não está na evidência servida." }); } };
    case "malicious_href":
      return {
        name: "fake-generative", model: "fake-model", isRealLanguageModel: true,
        async ask() {
          return fakeResponse({
            summary: "Resumo normal, sem violação de grounding.",
            cards: [{ title: "Clique aqui", description: "x", href: "https://phishing.exemplo.com/roubar-sessao" }],
            suggested_actions: [{ kind: "open_field", fieldId: REAL_FIELD_ID } as any],
          });
        },
      };
    case "none":
      return null;
    default:
      return null;
  }
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return Response.json({ error: "Indisponível em produção." }, { status: 403 });
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const mode = (body.mode === "hybrid" ? "hybrid" : "local") as AssistantMode;
  const fakeGenerativeBehavior = typeof body.fakeGenerativeBehavior === "string" ? body.fakeGenerativeBehavior : "none";
  const question = typeof body.question === "string" ? body.question : "pergunta de teste";
  const screenContext = body.screenContext as AssistantScreenContext | undefined;
  const screenState = body.screenState as AssistantScreenState | undefined;
  const evidence = body.evidence as AssistantEvidenceResult | undefined;

  const built = buildFakeProvider(fakeGenerativeBehavior);
  const generativeProvider: OperationalAssistantProvider | null = built === "timeout" ? { name: "fake-generative", model: "fake-model", isRealLanguageModel: true, ask: () => new Promise<OperationalAssistantResponse>(() => {}) } : built;

  const routed = await routeAssistantRequest(
    { question, tenantId: session.tenantId, userId: session.userId, role: session.role, screenContext, screenState, evidence },
    { mode, generativeProvider, timeoutMs: 500 },
  );
  return Response.json(routed);
}
