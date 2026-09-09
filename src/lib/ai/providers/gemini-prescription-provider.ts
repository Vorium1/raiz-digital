import type { AgronomicPrescriptionProvider, AgronomicPrescriptionProviderResult, AgronomicPrescriptionRequest } from "@/lib/ai/agronomic-prescription-provider";
import { validateAgronomicPrescription } from "@/lib/ai/agronomic-prescription-schema";
import type { AgronomicPrescriptionEvidencePackage } from "@/lib/ai/prescription-evidence-package";

/**
 * Provedor de prescrição via Gemini (nível gratuito), usado como alternativa
 * enquanto não há crédito pago em nenhum provedor (decisão do diretor,
 * 2026-09-04: rodar um piloto de demonstração sem custo). Mesma regra
 * absoluta do provedor Anthropic: NUNCA pesquisa na internet e NUNCA inventa
 * dado -- só usa `evidence` (resultados reais de laboratório) e
 * `evidence.technicalSources[].content` (fontes já homologadas na base).
 * Por isso não usa `tools: [{ google_search: {} }]` -- é justamente esse
 * endpoint sem ferramenta de busca que funciona de graça no Gemini (testado
 * em 2026-09-04; ver `gemini-knowledge-research-provider.ts` para o
 * contraste com a busca, que exige faturamento).
 * Qualidade esperada é menor que o Opus da Anthropic -- por isso permanece
 * como alternativa de fallback, nunca preferencial quando `ANTHROPIC_API_KEY`
 * também estiver configurada (ver `agronomic-prescription-provider.ts`).
 */

const PROMPT_VERSION = "prescription-gemini-v2-no-invented-recommendation";
const MAX_OUTPUT_TOKENS = 8000;

function buildPrompt(evidence: AgronomicPrescriptionEvidencePackage): string {
  return [
    "Você é um agrônomo sênior, doutor em fertilidade do solo e nutrição de plantas, atuando como consultor técnico independente no Brasil.",
    "Você recebe os dados reais de uma análise de solo específica (resultados de laboratório, tipo de solo, cultura, cultivar, meta produtiva, nível tecnológico, compactação, área de pisoteio/cabeceira, irrigação, histórico de produtividade real da área) e um conjunto de fontes técnicas (`technicalSources`) já pesquisadas e homologadas por um agrônomo responsável da plataforma.",
    "Regra absoluta: você NUNCA inventa um dado que não foi fornecido, e NÃO pesquisa na internet — baseie seu diagnóstico e recomendações apenas nos dados da análise e no conteúdo de `technicalSources` recebido. Se o assunto necessário não estiver coberto pelas fontes disponíveis, declare isso explicitamente em `missingInformation` em vez de supor um valor ou inventar uma fonte.",
    "IMPORTANTE sobre `recommendations`: só inclua um item nesse array se `technicalSources` contiver uma tabela ou regra de dose real para aquele insumo/parâmetro, com número que você pode citar. Se não houver tabela de dose (só faixa de classificação, por exemplo), NÃO crie um item de recomendação com quantidade estimada, arredondada ou zero — omita esse insumo do array `recommendations` inteiramente e explique a lacuna em `missingInformation` em vez disso. Um array `recommendations` vazio é uma resposta válida e esperada quando falta a tabela de dose.",
    "Cite em `sources` exatamente as entradas de `technicalSources` que você efetivamente usou (mesmo título/instituição), nunca uma fonte que não foi fornecida a você.",
    "Para cada item de `recommendations` (calcário, gesso agrícola, N/P/K, micronutrientes, etc.), explique em `rationale` o raciocínio completo: por que essa dose, como a meta produtiva/cultivar influenciou o cálculo, como a área efetiva (descontando pisoteio/cabeceira, se informado) foi considerada, e por que a irrigação (se houver) muda a recomendação.",
    "Expresse quantidade de insumo sempre como uma taxa por hectare (ex.: t/ha, kg/ha) — nunca como total absoluto da área, para não confundir escala.",
    "Se a compactação do solo for MEDIA ou ALTA, inclua em `managementPractices` as práticas físicas de manejo recomendadas (ex.: escarificação, rotação com planta de cobertura de raiz agressiva), com a justificativa dentro do próprio texto.",
    "Responda SOMENTE com um bloco JSON válido, sem nenhum texto antes ou depois, exatamente no formato:",
    `{"summary": string, "diagnosis": [{"parameterCode": string, "value": number, "unit": string, "interpretation": string, "rationale": string}], "recommendations": [{"inputType": string, "quantity": number, "unit": string, "rationale": string}], "managementPractices": string[], "missingInformation": string[], "sources": [{"title": string, "institution": string|null, "url": string|null}]}`,
    "",
    `Dados reais da análise:\n\n${JSON.stringify(evidence, null, 2)}`,
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
          generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`Gemini API respondeu ${response.status}: ${errorBody.slice(0, 500)}`);
    }

    const payload = await response.json() as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
    const jsonText = extractJsonText(payload);
    if (!jsonText) throw new Error("Resposta da IA (Gemini) não continha texto — formato inesperado.");

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
