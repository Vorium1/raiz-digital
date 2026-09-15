import { getPlatformSession } from "@/lib/auth/session";
import { localIntentAssistantProvider, LOCAL_INTENT_PROMPT_VERSION } from "@/lib/ai/providers/local-intent-assistant-provider";
import { geminiOperationalAssistantProvider, isGeminiOperationalAssistantAvailable, GEMINI_ASSISTANT_PROMPT_VERSION } from "@/lib/ai/providers/gemini-operational-assistant-provider";
import { BENCHMARK_SCENARIOS } from "@/lib/ai/benchmark/scenarios";
import { SYNTHETIC_TENANT_ID, SYNTHETIC_USER_ID } from "@/lib/ai/benchmark/fixtures";
import { runBenchmark, buildScorecard, UNIVERSAL_CRITERIA } from "@/lib/ai/benchmark/harness";
import { evaluateCriterion } from "@/lib/ai/benchmark/criteria";
import { saveRunArtifact, listRunArtifacts, loadRunArtifact } from "@/lib/ai/benchmark/artifact-store";
import { BENCHMARK_VERSION, type BenchmarkProvider, type ScenarioResult } from "@/lib/ai/benchmark/types";
import type { OperationalAssistantResponse } from "@/lib/ai/operational-assistant-provider";
import { runGroundingGateSelfTest } from "@/lib/ai/benchmark/grounding-gate-selftest";

/**
 * Fase 4E/4F, Bloco 4 — executa o harness de benchmark do Assistente RAIZ (`src/lib/ai/benchmark/`) contra
 * um provider real de verdade, pra gerar um scorecard reproduzível. NUNCA disponível em produção (bloqueio
 * explícito abaixo, redundante com o fato de exigir sessão autenticada). NUNCA usado por nenhuma tela real
 * -- é uma ferramenta de avaliação, documentada em `docs/RAIZ_2.0_FASE4E_PRE_LLM.md`/
 * `docs/RAIZ_2.0_FASE4F_GROUNDING_GATE.md`.
 *
 * `provider: "local"` (padrão) roda contra o determinístico atual -- sem custo, sem chamada externa.
 * `provider: "gemini"` roda chamadas REAIS à API do Gemini -- só quando pedido explicitamente.
 * `provider: "replay"` reavalia respostas JÁ SALVAS (artefato em disco ou inline) contra os critérios
 * ATUAIS, sem nenhuma chamada nova.
 * `provider: "list-artifacts"` lista as execuções reais já salvas (metadados, nunca o conteúdo inteiro).
 *
 * Toda execução real ("local"/"gemini") grava um ARTEFATO em disco com nome único (item 9, Fase 4F --
 * `artifact-store.ts`) -- nunca sobrescreve uma execução anterior. `resolveOperationalAssistantProvider()`
 * (usado pelo Assistente RAIZ real em `/api/assistant`) continua devolvendo só o local -- esta rota nunca
 * altera isso.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return Response.json({ error: "Benchmark indisponível em produção." }, { status: 403 });
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const providerName = typeof body.provider === "string" ? body.provider : "local";

  if (providerName === "list-artifacts") {
    return Response.json({ artifacts: await listRunArtifacts() });
  }

  // Fase 4F, item 6 -- roda a suíte adversarial do grounding gate (`assistant-grounding-gate.ts` +
  // `grounded-operational-assistant-provider.ts`) de verdade, dentro do runtime real (nunca precisa de
  // banco, mas precisa do bundler do Next pra resolver os imports internos -- mesmo motivo de todo o resto
  // desta camada ser testado via rota/e2e nesta base, documentado nas fases anteriores).
  if (providerName === "grounding-gate-selftest") {
    const result = await runGroundingGateSelfTest();
    return Response.json(result);
  }

  // Opcional -- roda só um subconjunto (ex.: pra respeitar cota de um tier gratuito num provider real sem
  // esperar o benchmark inteiro). Nunca afeta o conjunto oficial de cenários (`BENCHMARK_SCENARIOS`
  // continua intacto) -- só filtra quais rodam NESTA chamada.
  const scenarioIds = Array.isArray(body.scenarioIds) ? body.scenarioIds.filter((id): id is string => typeof id === "string") : null;
  const scenarios = scenarioIds ? BENCHMARK_SCENARIOS.filter((s) => scenarioIds.includes(s.id)) : BENCHMARK_SCENARIOS;

  // `provider: "replay"` -- reavalia RESPOSTAS JÁ COLETADAS contra os critérios ATUAIS, sem nenhuma
  // chamada nova a provider nenhum. Existe porque o tier gratuito do Gemini tem cota curta (achado real da
  // Fase 4E) -- reavaliar uma resposta real já coletada depois de corrigir um critério não deveria custar
  // uma nova chamada à API. Fase 4F, item 9 -- nunca depende implicitamente "do último resultado": ou lê um
  // artefato salvo pelo NOME (`artifactFilename`), ou recebe `responses` explícito no corpo -- nunca um
  // arquivo temporário reusado que uma execução seguinte poderia sobrescrever.
  if (providerName === "replay") {
    let responses: Record<string, OperationalAssistantResponse>;
    let sourceMeta: { provider: string; model: string; isRealLanguageModel: boolean } | undefined;
    if (typeof body.artifactFilename === "string") {
      const artifact = await loadRunArtifact(body.artifactFilename);
      if (!artifact) return Response.json({ error: `Artefato não encontrado: "${body.artifactFilename}".` }, { status: 404 });
      responses = Object.fromEntries(artifact.results.filter((r) => r.response).map((r) => [r.scenarioId, r.response as OperationalAssistantResponse]));
      sourceMeta = { provider: artifact.provider, model: artifact.model, isRealLanguageModel: artifact.isRealLanguageModel };
    } else {
      responses = (body.responses ?? {}) as Record<string, OperationalAssistantResponse>;
    }
    const results: ScenarioResult[] = scenarios
      .filter((s) => responses[s.id])
      .map((s) => {
        const response = responses[s.id];
        const criteriaNames = Array.from(new Set([...UNIVERSAL_CRITERIA, ...s.criteria]));
        const criteria = criteriaNames.map((name) => evaluateCriterion(name, response, s));
        return { scenarioId: s.id, category: s.category, description: s.description, latencyMs: 0, response, criteria, passed: criteria.every((c) => c.pass) };
      });
    const first = results[0]?.response;
    const scorecard = buildScorecard(sourceMeta?.provider ?? first?.provider ?? "replay", sourceMeta?.model ?? first?.model ?? "replay", sourceMeta?.isRealLanguageModel ?? first?.isRealLanguageModel ?? true, results);
    return Response.json({ scorecard, results });
  }

  let provider: BenchmarkProvider;
  let promptVersion: string;
  if (providerName === "local") {
    provider = localIntentAssistantProvider;
    promptVersion = LOCAL_INTENT_PROMPT_VERSION;
  } else if (providerName === "gemini") {
    if (!isGeminiOperationalAssistantAvailable()) return Response.json({ error: "GEMINI_API_KEY não configurada -- provider candidato Gemini indisponível." }, { status: 503 });
    provider = geminiOperationalAssistantProvider;
    promptVersion = GEMINI_ASSISTANT_PROMPT_VERSION;
  } else {
    return Response.json({ error: `provider desconhecido: "${providerName}" (use "local", "gemini", "replay" ou "list-artifacts").` }, { status: 400 });
  }

  const results = await runBenchmark(provider, scenarios, SYNTHETIC_TENANT_ID, SYNTHETIC_USER_ID);
  const scorecard = buildScorecard(provider.name, provider.model, provider.isRealLanguageModel, results);
  const artifactMeta = await saveRunArtifact({ provider: provider.name, model: provider.model, isRealLanguageModel: provider.isRealLanguageModel, promptVersion, benchmarkVersion: BENCHMARK_VERSION, scorecard, results });
  return Response.json({ scorecard, results, artifact: artifactMeta });
}
