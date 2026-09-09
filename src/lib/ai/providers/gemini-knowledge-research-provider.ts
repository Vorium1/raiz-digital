import type { KnowledgeResearchProvider, KnowledgeResearchRequest, KnowledgeResearchResult } from "@/lib/ai/knowledge-research-provider";
import { validateKnowledgeResearchSources } from "@/lib/ai/knowledge-research-schema";

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
    "Você é um agrônomo pesquisador, especialista em fertilidade do solo, produzindo material de referência técnica para uma base de conhecimento interna.",
    "Pesquise metodologia técnica atual e reconhecida sobre manejo de fertilidade e correção de solo para a cultura informada, priorizando o Manual de Calagem e Adubação para os Estados do Rio Grande do Sul e Santa Catarina (CQFS RS/SC), publicações da Embrapa, e universidades/institutos de pesquisa brasileiros equivalentes.",
    "Você NUNCA inventa um dado ou uma faixa técnica — cada item que você devolver precisa vir de uma fonte real que você encontrou pesquisando. Se não encontrar informação suficiente e confiável sobre algum tema, simplesmente não inclua um item para ele.",
    "Produza de 2 a 5 itens, cada um cobrindo um tema técnico específico (ex.: correção de acidez/calagem, fósforo, potássio, micronutrientes, compactação física).",
    "Responda SOMENTE com um array JSON válido, sem nenhum texto antes ou depois, exatamente no formato:",
    `[{"title": string, "institution": string|null, "editionYear": number|null, "subject": string, "content": string, "regionCode": string|null}]`,
    "`content` deve ser o resumo técnico completo e citável do que você encontrou — não uma frase, um parágrafo técnico de verdade.",
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
