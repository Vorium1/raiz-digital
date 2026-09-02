import { getPlatformSession } from "@/lib/auth/session";
import { resolveOperationalAssistantProvider, type AssistantScreenContext } from "@/lib/ai/operational-assistant-provider";
import { recordOperationalAssistantGeneration } from "@/lib/repositories/ai-generations";

const validScreenTypes = new Set(["field", "analysis", "property", "dashboard"]);

export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return Response.json({ error: "Digite uma pergunta." }, { status: 400 });

  let screenContext: AssistantScreenContext | undefined;
  const rawContext = body.screenContext as Record<string, unknown> | undefined;
  if (rawContext && typeof rawContext.type === "string" && validScreenTypes.has(rawContext.type)) {
    screenContext = rawContext.type === "dashboard" ? { type: "dashboard" } : { type: rawContext.type as "field" | "analysis" | "property", id: String(rawContext.id ?? "") };
  }

  // Contexto sempre construído no servidor a partir da sessão -- nunca aceita tenantId do corpo da requisição.
  const provider = resolveOperationalAssistantProvider();
  const result = await provider.ask({ question, tenantId: session.tenantId, userId: session.userId, role: session.role, screenContext });

  await recordOperationalAssistantGeneration({
    tenantId: session.tenantId,
    userId: session.userId,
    provider: result.provider,
    model: result.model,
    promptVersion: "local-intent-v1",
    requestPayload: { question, screenContext },
    responsePayload: { answer: result.answer, cards: result.cards },
  });

  return Response.json(result);
}
