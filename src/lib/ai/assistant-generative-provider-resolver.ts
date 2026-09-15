import type { OperationalAssistantProvider } from "@/lib/ai/operational-assistant-provider";
import { resolveAssistantMode } from "@/lib/ai/assistant-provider-router";
import { geminiOperationalAssistantProvider, isGeminiOperationalAssistantAvailable } from "@/lib/ai/providers/gemini-operational-assistant-provider";

/**
 * Fase 4G, item 4/5 — único lugar que decide QUAL provider generativo (se algum) o router recebe.
 * Deliberadamente separado de `assistant-provider-router.ts` (que nunca importa Gemini diretamente) -- é
 * este arquivo, e só ele, que sabe que o candidato de hoje é o Gemini. Trocar/adicionar um provider
 * (`SelfHostedOperationalAssistantProvider`, Claude, GPT...) no futuro é mudar SÓ este arquivo.
 *
 * Regra explícita (nunca implícita): ter `GEMINI_API_KEY` configurada NUNCA autoriza sozinha consumir a
 * API -- precisa TAMBÉM `RAIZ_ASSISTANT_MODE=hybrid` explicitamente. Credencial presente é uma
 * PRÉ-CONDIÇÃO técnica, nunca uma autorização de uso.
 */
export function resolveGenerativeProvider(): OperationalAssistantProvider | null {
  if (resolveAssistantMode() !== "hybrid") return null;
  if (!isGeminiOperationalAssistantAvailable()) return null;
  return geminiOperationalAssistantProvider;
}
