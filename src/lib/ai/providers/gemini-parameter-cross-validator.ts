import type { ParameterCrossValidationProvider, ParameterCrossValidationRequest, ParameterCrossValidationResult } from "@/lib/ai/providers/parameter-cross-validation-types";

/**
 * Cruzamento automático de UM parâmetro de perfil de cultura com a literatura agronômica reconhecida --
 * pedido do diretor, 2026-09-09, pra que a homologação humana vire um clique rápido de conferência em vez
 * de digitar/pesquisar tudo manualmente. REGRA ABSOLUTA, igual ao resto da camada de IA desta base: isto
 * nunca decide agronomia sozinho -- só devolve um veredito de CONSISTÊNCIA (bate com a literatura, diverge,
 * ou não há base suficiente) que fica salvo como sinal informativo (`ai_validation_*` em
 * `crop_profile_parameters`), pro curador humano decidir mais rápido. `status` do parâmetro em si só muda
 * quando um humano clica em Homologar (ver `setCropProfileParameterStatus`), nunca aqui.
 * Reaproveita o mesmo padrão de chamada REST + retry de `gemini-lab-extraction-provider.ts` (503/429 do
 * Gemini são pico temporário documentado pelo próprio Google, não erro nosso).
 */

const RETRYABLE_STATUS = new Set([503, 429]);
const RETRY_DELAYS_MS = [2000, 5000];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatRangesForPrompt(ranges: Array<{ label: string; min?: number; max?: number }>): string {
  return ranges
    .map((r) => {
      if (r.min == null && r.max != null) return `${r.label}: menor que ${r.max}`;
      if (r.max == null && r.min != null) return `${r.label}: maior que ${r.min}`;
      if (r.min != null && r.max != null) return `${r.label}: entre ${r.min} e ${r.max}`;
      return r.label;
    })
    .join("; ");
}

function buildPrompt(request: ParameterCrossValidationRequest): string {
  return [
    "Você é um agrônomo sênior, doutor em fertilidade do solo e nutrição de plantas, revisando um parâmetro técnico cadastrado numa plataforma de recomendação agronômica antes que ele seja homologado por um profissional humano.",
    "Sua tarefa: avaliar se as faixas de suficiência abaixo, cadastradas para este parâmetro/cultura/profundidade/método, correspondem ao que está estabelecido em literatura agronômica brasileira reconhecida (ex.: Boletim 100 do IAC/Raij, Sousa & Lobato/Embrapa Cerrados, manuais de calagem e adubação CQFS-RS/SC, boletins técnicos de universidades e institutos de pesquisa oficiais).",
    "Regra absoluta: você NUNCA inventa uma fonte, um número ou um consenso que não existe de verdade. Se você não tiver confiança real na literatura sobre este parâmetro específico (cultura, profundidade, método), responda status \"INDETERMINADO\" com confidence baixo -- isso é uma resposta válida e esperada, preferível a forçar uma opinião.",
    "Só responda \"CONSISTENTE\" quando as faixas cadastradas realmente corresponderem (mesma ordem de grandeza e mesmos limiares, mesmo que os rótulos usem palavras um pouco diferentes) ao que a literatura reconhecida estabelece.",
    "Responda \"INCONSISTENTE\" quando encontrar uma divergência real e explique exatamente qual é a diferença em `summary`, para o curador humano revisar com atenção antes de homologar.",
    "Em `sources`, cite APENAS publicações/instituições reais e reconhecidas que você tem confiança real de que existem e tratam deste assunto -- nunca invente um título ou instituição.",
    "Responda SOMENTE com um bloco JSON válido, sem nenhum texto antes ou depois, exatamente no formato:",
    `{"status": "CONSISTENTE"|"INCONSISTENTE"|"INDETERMINADO", "confidence": number (0 a 100), "summary": string (1-3 frases explicando o veredito), "sources": [{"title": string, "institution": string|null}]}`,
    "",
    "Dados do parâmetro cadastrado:",
    `Cultura: ${request.cropName} (${request.cropCode})`,
    `Parâmetro: ${request.parameterCode} (categoria ${request.parameterCategory}, tipo de amostra ${request.sampleType})`,
    `Profundidade: ${request.depthFromCm ?? "?"}-${request.depthToCm ?? "?"} cm`,
    `Unidade: ${request.unitExpected ?? "não informada"}`,
    `Método(s) analítico(s) aceito(s): ${request.analyticalMethodAllowed.join(", ") || "não informado"}`,
    `Faixas cadastradas: ${formatRangesForPrompt(request.sufficiencyRanges)}`,
  ].join("\n");
}

function extractJsonText(payload: unknown): string | null {
  const record = payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = record.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

const VALID_STATUS = new Set(["CONSISTENTE", "INCONSISTENTE", "INDETERMINADO"]);

function validateResult(parsed: unknown): { status: "CONSISTENTE" | "INCONSISTENTE" | "INDETERMINADO"; confidence: number; summary: string; sources: Array<{ title: string; institution: string | null }> } | null {
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  if (typeof record.status !== "string" || !VALID_STATUS.has(record.status)) return null;
  if (typeof record.confidence !== "number" || Number.isNaN(record.confidence)) return null;
  if (typeof record.summary !== "string" || !record.summary.trim()) return null;
  const rawSources = Array.isArray(record.sources) ? record.sources : [];
  const sources = rawSources
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === "object")
    .map((s) => ({ title: typeof s.title === "string" ? s.title : "", institution: typeof s.institution === "string" ? s.institution : null }))
    .filter((s) => s.title.trim().length > 0);
  return {
    status: record.status as "CONSISTENTE" | "INCONSISTENTE" | "INDETERMINADO",
    confidence: Math.max(0, Math.min(100, record.confidence)),
    summary: record.summary.trim(),
    sources,
  };
}

export const geminiParameterCrossValidator: ParameterCrossValidationProvider = {
  name: "google",
  model: process.env.GEMINI_PARAMETER_VALIDATION_MODEL ?? "gemini-3.6-flash",
  isRealLanguageModel: true,

  async crossValidate(request: ParameterCrossValidationRequest): Promise<ParameterCrossValidationResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY não configurada -- cruzamento automático indisponível.");
    const model = this.model;

    let response: Response | undefined;
    let lastErrorBody = "";
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: buildPrompt(request) }] }],
            // 8000 (não 2000) -- este modelo "pensa" antes de responder e o orçamento de tokens de saída
            // cobre pensamento + resposta juntos (descoberto testando com o prompt real, 2026-09-09: um
            // limite baixo cortava o JSON no meio, sempre no mesmo padrão usado no resto da camada de IA).
            generationConfig: { maxOutputTokens: 8000, temperature: 0 },
          }),
        },
      );
      if (response.ok) break;
      lastErrorBody = await response.text().catch(() => "");
      const shouldRetry = RETRYABLE_STATUS.has(response.status) && attempt < RETRY_DELAYS_MS.length;
      if (!shouldRetry) break;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }

    if (!response!.ok) {
      throw new Error(`Gemini API respondeu ${response!.status} (após ${RETRY_DELAYS_MS.length + 1} tentativa(s)): ${lastErrorBody.slice(0, 500)}`);
    }

    const payload = await response!.json();
    const jsonText = extractJsonText(payload);
    if (!jsonText) throw new Error("Resposta da IA (Gemini) não continha texto -- formato inesperado.");

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error("Resposta da IA (Gemini) não é um JSON válido -- nada foi salvo.");
    }

    const validated = validateResult(parsed);
    if (!validated) throw new Error("Resposta da IA (Gemini) não corresponde ao formato exigido -- nada foi salvo.");

    return { ...validated, provider: "google", model, isRealLanguageModel: true };
  },
};
