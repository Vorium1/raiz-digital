import type { AgronomicPrescriptionProvider, AgronomicPrescriptionProviderResult, AgronomicPrescriptionRequest } from "@/lib/ai/agronomic-prescription-provider";
import { validateAgronomicPrescription } from "@/lib/ai/agronomic-prescription-schema";
import type { AgronomicPrescriptionEvidencePackage } from "@/lib/ai/prescription-evidence-package";

/**
 * Provedor de prescrição via Gemini. Toda prescrição continua subordinada ao gate de governança da rota:
 * só a MESMA interpretação determinística APPROVED presente na evidência pode chegar aqui, e toda geração
 * nasce PENDING_REVIEW.
 */

const PROMPT_VERSION = "prescription-gemini-v4-deterministic-grounding";
const MAX_OUTPUT_TOKENS = 8000;

const PRESCRIPTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "diagnosis", "recommendations", "managementPractices", "missingInformation", "sources"],
  properties: {
    summary: { type: "string", description: "Síntese agronômica objetiva baseada somente nas evidências fornecidas." },
    diagnosis: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["parameterCode", "value", "unit", "interpretation", "rationale"],
        properties: {
          parameterCode: { type: "string" },
          value: { type: "number" },
          unit: { type: "string" },
          interpretation: { type: "string" },
          rationale: { type: "string" },
        },
      },
    },
    recommendations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["inputType", "quantity", "unit", "rationale"],
        properties: {
          inputType: { type: "string" },
          quantity: { type: "number", minimum: 0.000001 },
          unit: { type: "string" },
          rationale: { type: "string" },
        },
      },
    },
    managementPractices: { type: "array", items: { type: "string" } },
    missingInformation: { type: "array", items: { type: "string" } },
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "institution", "url"],
        properties: {
          title: { type: "string" },
          institution: { type: "string", description: "Use string vazia se não houver instituição." },
          url: { type: "string", description: "Use string vazia se não houver URL na evidência." },
        },
      },
    },
  },
} as const;

function buildPrompt(evidence: AgronomicPrescriptionEvidencePackage): string {
  return [
    "Você é um agrônomo sênior, doutor em fertilidade do solo e nutrição de plantas, atuando como consultor técnico independente no Brasil.",
    "Você recebe dados reais de uma análise, uma interpretação determinística JÁ revisada/aprovada e fontes técnicas ACTIVE presentes na plataforma.",
    "Regra absoluta: NUNCA invente dado, dose, fonte, método, produtividade, custo ou contexto que não esteja nas evidências recebidas. Não pesquise na internet.",
    "`deterministicInterpretation.structuredOutput.interpretation` é a autoridade para as CLASSIFICAÇÕES. Não reclassifique o laudo bruto, não substitua uma classe do motor e não crie uma segunda interpretação paralela. Os `results` brutos existem apenas para rastreabilidade, valores e unidades.",
    "Se um parâmetro está marcado como não interpretável/pending na interpretação determinística, trate-o como informação pendente; não invente a classe correspondente.",
    "Só inclua `recommendations` quando `technicalSources` contiver regra/tabela ACTIVE real que sustente a dose E todas as entradas exigidas por essa regra estiverem presentes no contexto.",
    "`cultivationYears` descreve histórico de cultivo da área. NÃO interprete esse campo como '1º/2º cultivo após a análise de solo'. Se uma tabela de dose depender dessa sequência e ela não estiver explicitamente presente, não gere a dose e registre a falta em `missingInformation`.",
    "Se a regra exigir meta de produtividade e `season.yieldGoal`/`yieldGoalUnit` estiverem ausentes, não assuma produtividade de referência, teto, média regional ou meta implícita: omita a dose dependente disso e registre a lacuna.",
    "Um array `recommendations` vazio é correto quando a evidência não sustenta uma dose. É melhor declarar falta de informação do que produzir uma recomendação aparentemente completa e tecnicamente falsa.",
    "Em `diagnosis`, mantenha valor e unidade coerentes com o dado recebido e a classificação exatamente coerente com a interpretação determinística. Não faça conversão implícita.",
    "Em `sources`, use exclusivamente fontes recebidas em `technicalSources`; título deve corresponder à evidência. Se instituição/URL não existirem, use string vazia.",
    "Para cada recomendação válida, explique em `rationale` qual regra ACTIVE foi usada e quais entradas reais sustentaram a quantidade. Quantidade sempre por hectare, nunca total absoluto da fazenda.",
    "Práticas de manejo sem dose também precisam ser sustentadas pela evidência/contexto fornecido; não transformar hipótese em recomendação oficial.",
    "A resposta deve obedecer exatamente ao schema JSON solicitado pela API.",
    "",
    `Evidências permitidas:\n\n${JSON.stringify(evidence, null, 2)}`,
  ].join("\n\n");
}

function extractJsonText(payload: unknown): string | null {
  const record = payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = record.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

export const geminiPrescriptionProvider: AgronomicPrescriptionProvider = {
  name: "google",
  model: process.env.GEMINI_PRESCRIPTION_MODEL ?? "gemini-3.6-flash",
  isRealLanguageModel: true,

  async prescribe(request: AgronomicPrescriptionRequest): Promise<AgronomicPrescriptionProviderResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY não configurada.");
    const model = this.model;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: buildPrompt(request.evidence) }] }],
          generationConfig: {
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            temperature: 0.2,
            responseMimeType: "application/json",
            responseJsonSchema: PRESCRIPTION_JSON_SCHEMA,
          },
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`Gemini API respondeu ${response.status}: ${errorBody.slice(0, 500)}`);
    }

    const payload = await response.json() as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
    const jsonText = extractJsonText(payload);
    if (!jsonText) throw new Error("Resposta da IA (Gemini) não continha JSON utilizável — nada foi salvo.");

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error("Resposta da IA (Gemini) não é um JSON válido — nada foi salvo.");
    }

    const prescription = validateAgronomicPrescription(parsed);
    if (!prescription) throw new Error("Resposta da IA (Gemini) não corresponde ao formato exigido — nada foi salvo.");

    return {
      prescription,
      provider: "google",
      model,
      promptVersion: PROMPT_VERSION,
      generatedAt: new Date().toISOString(),
      isRealLanguageModel: true,
      tokensUsed: (payload.usageMetadata?.promptTokenCount ?? 0) + (payload.usageMetadata?.candidatesTokenCount ?? 0) || undefined,
    };
  },
};
