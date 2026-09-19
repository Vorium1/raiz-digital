import type { KnowledgeResearchProvider, KnowledgeResearchRequest, KnowledgeResearchResult } from "@/lib/ai/knowledge-research-provider";
import { validateKnowledgeResearchSources } from "@/lib/ai/knowledge-research-schema";
import { AGRONOMY_KNOWLEDGE_COVERAGE_TEXT } from "@/domain/agronomy-knowledge-domains";

/**
 * TESTADO CONTRA A API REAL EM 2026-09-04 (chave gratuita, nível free do
 * Google AI Studio). Resultado:
 * - `generateContent` sem ferramentas: funciona no nível gratuito, mas só em
 *   modelos da linha "flash" -- `gemini-2.5-pro` não existe mais para conta
 *   nova (404) e `gemini-pro-latest`/`gemini-3.1-pro` respondem 429 com
 *   `limit: 0` no free tier. Por isso o modelo padrão abaixo é um flash.
 * - `tools: [{ google_search: {} }]` (embasamento em busca real): responde
 *   429 mesmo com poucas chamadas e sem detalhe de quota (diferente do 429
 *   de `pro-latest`, que veio com `QuotaFailure` explícito) -- ou seja, a
 *   API está recusando a ferramenta de busca em si, não limitando taxa.
 *   Pelos padrões conhecidos da Generative Language API, embasamento em
 *   busca via Google costuma exigir faturamento vinculado ao projeto do
 *   Google Cloud, mesmo quando o uso ficaria dentro da cota gratuita.
 * CONSEQUÊNCIA: com a chave gratuita atual, este provedor NÃO consegue
 * pesquisar a internet de verdade -- só geraria texto sem embasamento, o
 * que violaria a regra do projeto de nunca inventar dado técnico. Por isso
 * `research()` recusa explicitamente até haver confirmação de que a
 * ferramenta de busca está habilitada (ver checagem abaixo). Não usar este
 * provedor em produção sem antes confirmar no Google AI Studio / Google
 * Cloud Console que a busca (grounding) está ativa para esta chave.
 */

const PROMPT_VERSION = "knowledge-research-gemini-v1";
const MAX_OUTPUT_TOKENS = 4000;
const GROUNDING_UNAVAILABLE_HINT =
  "Gemini: a ferramenta de busca (google_search) não está disponível para esta chave " +
  "(resposta 429 sem detalhe de quota). No nível gratuito isso costuma indicar que falta " +
  "vincular faturamento ao projeto no Google Cloud Console -- confirme lá antes de tentar de novo.";

function buildPrompt(request: KnowledgeResearchRequest): string {
  return [
    "Você é um pesquisador agrônomo multidisciplinar, produzindo material de referência técnica para uma base de conhecimento interna.",
    "Pesquise conhecimento técnico atual e reconhecido para a cultura informada. Priorize fontes oficiais, manuais regionais, Embrapa, universidades, sociedades científicas e artigos revisados por pares. Não limite a pesquisa a fertilidade.",
    "Você NUNCA inventa um dado ou uma faixa técnica — cada item que você devolver precisa vir de uma fonte real que você encontrou pesquisando. Se não encontrar informação suficiente e confiável sobre algum tema, simplesmente não inclua um item para ele.",
    "Produza de 4 a 8 itens cobrindo áreas diferentes e relevantes da matriz curricular abaixo; não repita o mesmo tema só para preencher quantidade.",
    "Matriz de cobertura agronômica (define O QUE investigar, nunca a dose):\n" + AGRONOMY_KNOWLEDGE_COVERAGE_TEXT,
    "Responda SOMENTE com um array JSON válido, sem nenhum texto antes ou depois, exatamente no formato:",
    `[{"title": string, "institution": string|null, "editionYear": number|null, "subject": string, "content": string, "regionCode": string|null, "sourceUrl": string|null, "doi": string|null, "evidenceType": "REGIONAL_MANUAL"|"SYSTEMATIC_REVIEW"|"META_ANALYSIS"|"MULTILOCATION_TRIAL"|"CONTROLLED_FIELD_TRIAL"|"OBSERVATIONAL_FIELD"|"MECHANISTIC"|"UNCLASSIFIED", "evidenceStrength": "DIRECT_STRONG"|"TRANSFERRED_STRONG"|"MODERATE"|"EXPERIMENTAL"|"OBSERVATIONAL"|"CONFLICTING"|"INSUFFICIENT"|"UNASSESSED", "requiresLocalCalibration": boolean, "requiresAgronomistReview": boolean, "quantitativeUseStatus": "CONTEXT_ONLY"|"REVIEW_ONLY"}]`,
    "`content` deve resumir fielmente o que a fonte sustenta, incluindo condições e limites. `sourceUrl` ou `doi` deve identificar a fonte original sempre que disponível. Não marque uma afirmação quantitativa como homologada; pesquisa não cria regra de dose.",
    "",
    `Cultura: ${request.cropName} (código ${request.cropCode}).`,
    `Regiões técnicas já cadastradas na plataforma: ${request.regionCodes.length ? request.regionCodes.join(", ") : "nenhuma cadastrada ainda — pesquise de forma geral para RS/SC."}`,
  ].join("\n\n");
}

function extractJsonText(payload: unknown): string | null {
  const record = payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = record.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

export const geminiKnowledgeResearchProvider: KnowledgeResearchProvider = {
  name: "google",
  model: process.env.GEMINI_KNOWLEDGE_RESEARCH_MODEL ?? "gemini-3.6-flash",

  async research(request: KnowledgeResearchRequest): Promise<KnowledgeResearchResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY não configurada.");
    const model = this.model;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: buildPrompt(request) }] }],
          tools: [{ google_search: {} }],
          generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      if (response.status === 429 && !errorBody.includes("QuotaFailure")) {
        throw new Error(GROUNDING_UNAVAILABLE_HINT);
      }
      throw new Error(`Gemini API respondeu ${response.status}: ${errorBody.slice(0, 500)}`);
    }

    const payload = await response.json() as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
    const jsonText = extractJsonText(payload);
    if (!jsonText) throw new Error(`Pesquisa (Gemini) de "${request.cropName}": resposta sem texto — formato inesperado.`);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error(`Pesquisa (Gemini) de "${request.cropName}": resposta não é um JSON válido — descartada.`);
    }

    const sources = validateKnowledgeResearchSources(parsed);
    if (!sources) throw new Error(`Pesquisa (Gemini) de "${request.cropName}": formato de resposta inválido — descartada.`);

    return {
      sources,
      provider: "google",
      model,
      promptVersion: PROMPT_VERSION,
      tokensUsed: (payload.usageMetadata?.promptTokenCount ?? 0) + (payload.usageMetadata?.candidatesTokenCount ?? 0) || undefined,
    };
  },
};
