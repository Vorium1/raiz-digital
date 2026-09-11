import { getPlatformSession } from "@/lib/auth/session";
import { localIntentAssistantProvider } from "@/lib/ai/providers/local-intent-assistant-provider";
import { geminiOperationalAssistantProvider, isGeminiOperationalAssistantAvailable } from "@/lib/ai/providers/gemini-operational-assistant-provider";
import { BENCHMARK_SCENARIOS } from "@/lib/ai/benchmark/scenarios";
import { SYNTHETIC_TENANT_ID, SYNTHETIC_USER_ID } from "@/lib/ai/benchmark/fixtures";
import { runBenchmark, buildScorecard } from "@/lib/ai/benchmark/harness";
import { evaluateCriterion } from "@/lib/ai/benchmark/criteria";
import type { BenchmarkProvider, ScenarioResult } from "@/lib/ai/benchmark/types";
import type { OperationalAssistantResponse } from "@/lib/ai/operational-assistant-provider";

/**
 * Fase 4E, Bloco 4 — executa o harness de benchmark do Assistente RAIZ (`src/lib/ai/benchmark/`) contra um
 * provider real de verdade, pra gerar um scorecard reproduzível. NUNCA disponível em produção (bloqueio
 * explícito abaixo, redundante com o fato de exigir sessão autenticada). NUNCA usado por nenhuma tela real
 * -- é uma ferramenta de avaliação, chamada manualmente (ou por script) quando alguém quiser rodar/re-rodar
 * o benchmark, documentado em `docs/RAIZ_2.0_FASE4E_PRE_LLM.md`.
 *
 * `provider: "local"` (padrão) roda contra o determinístico atual -- sem custo, sem chamada externa.
 * `provider: "gemini"` roda chamadas REAIS à API do Gemini (mesma `GEMINI_API_KEY` já configurada nesta
 * instância pelo dono do projeto -- nunca lida/impressa aqui, só checada como presente/ausente) -- é o
 * ÚNICO ponto desta fase onde uma chamada real a um provider generativo acontece, e só quando alguém pede
 * explicitamente `provider: "gemini"` (nunca automático, nunca o padrão da rota).
 *
 * `resolveOperationalAssistantProvider()` (`operational-assistant-provider.ts`, usado pelo Assistente RAIZ
 * real em `/api/assistant`) continua devolvendo só o local -- esta rota nunca altera isso.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return Response.json({ error: "Benchmark indisponível em produção." }, { status: 403 });
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const providerName = typeof body.provider === "string" ? body.provider : "local";
  // Opcional -- roda só um subconjunto (ex.: pra respeitar cota de um tier gratuito num provider real sem
  // esperar o benchmark inteiro). Nunca afeta o conjunto oficial de cenários (`BENCHMARK_SCENARIOS`
  // continua intacto) -- só filtra quais rodam NESTA chamada.
  const scenarioIds = Array.isArray(body.scenarioIds) ? body.scenarioIds.filter((id): id is string => typeof id === "string") : null;
  const scenarios = scenarioIds ? BENCHMARK_SCENARIOS.filter((s) => scenarioIds.includes(s.id)) : BENCHMARK_SCENARIOS;

  // `provider: "replay"` -- reavalia RESPOSTAS JÁ COLETADAS (`responses: {scenarioId: OperationalAssistantResponse}`)
  // contra os critérios ATUAIS, sem nenhuma chamada nova a provider nenhum. Existe porque o tier gratuito
  // do Gemini tem cota curta (achado real desta rodada, documentado em `docs/RAIZ_2.0_FASE4E_PRE_LLM.md`)
  // -- reavaliar uma resposta real já coletada depois de corrigir um critério não deveria custar uma nova
  // chamada à API.
  if (providerName === "replay") {
    const responses = (body.responses ?? {}) as Record<string, OperationalAssistantResponse>;
    const results: ScenarioResult[] = scenarios
      .filter((s) => responses[s.id])
      .map((s) => {
        const response = responses[s.id];
        const criteria = s.criteria.map((name) => evaluateCriterion(name, response, s));
        return { scenarioId: s.id, category: s.category, description: s.description, latencyMs: 0, response, criteria, passed: criteria.every((c) => c.pass) };
      });
    const providerMeta = results[0]?.response;
    const scorecard = buildScorecard(providerMeta?.provider ?? "replay", providerMeta?.model ?? "replay", providerMeta?.isRealLanguageModel ?? true, results);
    return Response.json({ scorecard, results });
  }

  let provider: BenchmarkProvider;
  if (providerName === "local") {
    provider = localIntentAssistantProvider;
  } else if (providerName === "gemini") {
    if (!isGeminiOperationalAssistantAvailable()) return Response.json({ error: "GEMINI_API_KEY não configurada -- provider candidato Gemini indisponível." }, { status: 503 });
    provider = geminiOperationalAssistantProvider;
  } else {
    return Response.json({ error: `provider desconhecido: "${providerName}" (use "local" ou "gemini").` }, { status: 400 });
  }

  const results = await runBenchmark(provider, scenarios, SYNTHETIC_TENANT_ID, SYNTHETIC_USER_ID);
  const scorecard = buildScorecard(provider.name, provider.model, provider.isRealLanguageModel, results);
  return Response.json({ scorecard, results });
}
