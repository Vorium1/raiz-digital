import type { AgronomicPrescriptionProvider, AgronomicPrescriptionProviderResult, AgronomicPrescriptionRequest } from "@/lib/ai/agronomic-prescription-provider";
import { validateAgronomicPrescription } from "@/lib/ai/agronomic-prescription-schema";
import type { AgronomicPrescriptionEvidencePackage } from "@/lib/ai/prescription-evidence-package";

/**
 * Provedor de prescrição via Gemini. Toda prescrição continua subordinada ao gate de governança da rota:
 * só uma interpretação determinística APPROVED pode chegar aqui, e toda geração nasce PENDING_REVIEW.
 *
 * Fechamento 2026-09-12: a primeira integração pedia JSON apenas no prompt. Em dado real Cabeda o modelo
 * respondeu algo que não passou pelo schema e a rota devolveu 502. Agora a própria API recebe
 * `responseMimeType=application/json` + `responseJsonSchema`, reduzindo drasticamente a liberdade de formato.
 * O validador local continua obrigatório mesmo assim; structured output não substitui validação server-side.
 */

const PROMPT_VERSION = "prescription-gemini-v3-structured-output";
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
    "Você recebe os dados reais de uma análise específica e fontes técnicas já presentes e homologadas na plataforma.",
    "Regra absoluta: NUNCA invente dado, dose, fonte, método, produtividade, custo ou contexto que não esteja nas evidências recebidas. Não pesquise na internet.",
    "Só inclua `recommendations` quando `technicalSources` contiver regra/tabela real que sustente a dose. Se houver apenas faixa de classificação, deixe a recomendação ausente e explique a lacuna em `missingInformation`.",
    "Um array `recommendations` vazio é correto quando a evidência não sustenta uma dose. É melhor declarar falta de informação do que produzir uma recomendação aparentemente completa e tecnicamente falsa.",
    "Em `diagnosis`, mantenha valor e unidade coerentes com o dado recebido. Não faça conversão implícita.",
    "Em `sources`, use exclusivamente fontes recebidas em `technicalSources`; título deve corresponder à evidência. Se instituição/URL não existirem, use string vazia.",
    "Para cada recomendação válida, explique em `rationale` a regra técnica usada e os fatores do contexto realmente disponíveis. Quantidade sempre por hectare, nunca total absoluto da fazenda.",
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
