import type { AgronomicPrescriptionProvider, AgronomicPrescriptionProviderResult, AgronomicPrescriptionRequest } from "@/lib/ai/agronomic-prescription-provider";
import { validateAgronomicPrescription } from "@/lib/ai/agronomic-prescription-schema";
import type { AgronomicPrescriptionEvidencePackage } from "@/lib/ai/prescription-evidence-package";

const PROMPT_VERSION = "prescription-gemini-v9-optional-biology-irrigation";
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
    "Só inclua `recommendations` quando houver regra técnica rastreável e todas as entradas exigidas estiverem presentes no contexto.",
    "`season.cultivationOrderAfterSoilAnalysis` é o ÚNICO campo autorizado para representar 1º/2º cultivo após a análise. `season.cultivationYears` descreve apenas o histórico de anos de cultivo da área e NUNCA pode substituí-lo.",
    "Para P/K, use os três blocos recebidos: `pkDoseReadiness` (contexto), `uniformPkReadiness` (cultura/regra + representatividade) e `deterministicPkDoses` (dose/faixa calculada pelo motor). Se qualquer gate estiver bloqueado para um nutriente, NÃO gere P2O5/K2O para ele e registre os blockers em `missingInformation`.",
    "Quando `deterministicPkDoses.P2O5` ou `.K2O` estiver `ready=true`, NÃO recalcule, estime nem ajuste por conta própria: para dose não discricionária, copie exatamente `expected.doseKgPerHa` em kg/ha. O servidor recalculará antes de promover a recomendação oficial.",
    "`deterministicLimingDecision` é a única autoridade para calagem. Se `status=UNIFORM_APPLY`, inclua exatamente uma recomendação com `inputType=CALCARIO_PRNT100`, quantidade exatamente `uniformDoseTonHaPrnt100` e unidade `t/ha`. Não recalcule, não ajuste e não escolha produto comercial.",
    "Se `deterministicLimingDecision.status=UNIFORM_NO_APPLY`, NÃO gere dose positiva de calcário. Se `status=SPATIAL` e `automaticGeneralDoseAllowed=true`, copie exatamente `operationalGeneralDoseTonHaPrnt100` como uma recomendação `CALCARIO_PRNT100`; a média já veio pronta do motor e o modelo NÃO pode recalculá-la. Preserve também as doses por ponto em `managementPractices`. Se `status=BLOCKED`, não gere calcário e leve a limitação para `missingInformation`.",
    "PRNT 100% representa necessidade equivalente. Nunca converta para massa de um corretivo comercial sem o PRNT real declarado e nunca escolha marca/produto por conta própria.",
    "`analysis.plannedManagementNotes` é contexto OPCIONAL do manejo futuro (cultivar, fertilizante, fungicida, inseticida, bioinsumo etc.). Se vazio, não marque como falta e não bloqueie o parecer. Se preenchido, use apenas para contextualizar práticas/alertas suportados pelas fontes; nunca altere P/K/S/calagem determinísticos por conta própria.",
    "`analysis.irrigationContext` é OPCIONAL e progressivo. Se houver somente irrigado/sequeiro, não suponha lâmina, frequência, horário, vazão ou eficiência. Dados adicionais apenas refinam riscos e práticas; sua ausência nunca bloqueia o parecer.",
    "Parâmetros biológicos em `results` (BioAS e outros ensaios microbiológicos) são evidência OPCIONAL. Ausência não é pendência. Presença não autoriza crédito automático de nutrientes, desconto/acréscimo de dose ou recálculo de IQS. Preserve índices e interpretações laboratoriais como evidência da fonte e só aplique regra quantitativa quando houver motor específico homologado.",
    "`analysis.fertilityPlanningHorizonYears` e `analysis.fertilityCyclePlanNotes` representam o CICLO ENTRE ANÁLISES, não a meta isolada da próxima cultura. Use-os apenas para contextualizar construção/correção do solo e manutenção das safras. Nunca multiplique dose anual pelo número de anos e nunca transforme a meta da próxima safra em demanda acumulada sem cálculo determinístico específico.",
    "Correção inicial não substitui manutenção. Se a manutenção futura não estiver prevista, registre risco de balanço negativo; NÃO invente uma produtividade média futura, duração garantida da correção ou número de safras sustentadas.",
    "Nunca transforme maioria simples, média ou 50% dos pontos em classe uniforme. Se `uniformPkReadiness` bloquear por ausência de predominância estrita, mantenha a heterogeneidade explícita.",
    "Se a regra exigir meta de produtividade e ela estiver ausente ou não suportada, não assuma produtividade de referência, teto, média regional ou meta implícita.",
    "`season.technologyLevel` é apenas metadado/cenário. NÃO aumente ou reduza dose por BAIXO/MEDIO/ALTO sem regra quantitativa homologada.",
    "Taxa variável é um fluxo separado e sob demanda. Este provedor não deve criar mapa, zona, pixel ou dose espacial sem solicitação espacial explícita e gate espacial próprio.",
    "Um array `recommendations` vazio é correto quando a evidência não sustenta uma dose. É melhor declarar falta de informação do que produzir uma recomendação aparentemente completa e tecnicamente falsa.",
    "Em `diagnosis`, mantenha valor e unidade coerentes com o dado recebido e a classificação exatamente coerente com a interpretação determinística. Não faça conversão implícita.",
    "Em `sources`, use exclusivamente fontes recebidas em `technicalSources`; título deve corresponder à evidência. Se instituição/URL não existirem, use string vazia.",
    "Para cada recomendação válida, explique em `rationale` qual regra foi usada e quais entradas reais sustentaram a quantidade. Quantidade sempre por hectare, nunca total absoluto da fazenda.",
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
