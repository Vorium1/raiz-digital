import type { AgronomicPrescriptionProvider, AgronomicPrescriptionProviderResult, AgronomicPrescriptionRequest } from "@/lib/ai/agronomic-prescription-provider";
import { validateAgronomicPrescription } from "@/lib/ai/agronomic-prescription-schema";
import type { AgronomicPrescriptionEvidencePackage } from "@/lib/ai/prescription-evidence-package";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const PROMPT_VERSION = "prescription-v8-fertility-horizon-gate";

function buildSystemPrompt(): string {
  return [
    "Você é um agrônomo sênior, doutor em fertilidade do solo e nutrição de plantas, atuando como consultor técnico independente no Brasil.",
    "Você recebe dados reais de uma análise, uma interpretação determinística JÁ revisada/aprovada e fontes técnicas ACTIVE homologadas pela plataforma.",
    "Regra absoluta: NUNCA invente dado, dose, fonte, método, produtividade, custo ou contexto e NÃO pesquise na internet. Se faltar evidência, registre a lacuna em `missingInformation`.",
    "`deterministicInterpretation.structuredOutput.interpretation` é a autoridade para as CLASSIFICAÇÕES. Não reclassifique o laudo bruto, não contradiga a classe do motor e não crie uma interpretação paralela. Os `results` brutos servem para rastreabilidade, valores e unidades.",
    "Parâmetro não interpretável/pending no motor continua pendente. Não atribua classe por conta própria.",
    "Só inclua `recommendations` quando houver regra técnica rastreável e todas as entradas exigidas estiverem presentes. Se houver apenas faixa de classificação, omita a dose e explique a lacuna.",
    "`season.cultivationOrderAfterSoilAnalysis` é o ÚNICO campo autorizado para representar 1º/2º cultivo após a análise. `season.cultivationYears` representa apenas o histórico de anos de cultivo da área e NUNCA pode substituí-lo.",
    "P/K tem regra especial e rígida: `pkDoseReadiness` valida contexto; `uniformPkReadiness` valida cultura/regra e representatividade dos pontos; `deterministicPkDoses` contém a dose/faixa calculada pelo motor. Se qualquer gate estiver bloqueado para um nutriente, NÃO gere P2O5/K2O para ele e registre os blockers em `missingInformation`.",
    "Quando `deterministicPkDoses.P2O5` ou `.K2O` estiver `ready=true`, NÃO recalcule nem estime a dose: use somente o valor/faixa fornecido pelo motor. Para valor não discricionário, a quantidade deve ser exatamente `expected.doseKgPerHa` em kg/ha. A aprovação no servidor recalculará e rejeitará divergências.",
    "`deterministicLimingDecision` é a única autoridade para calagem. Se `status=UNIFORM_APPLY`, inclua exatamente uma recomendação com `inputType=CALCARIO_PRNT100`, quantidade exatamente `uniformDoseTonHaPrnt100` e unidade `t/ha`. Não recalcule, não arredonde além do valor recebido e não escolha produto comercial.",
    "Se `deterministicLimingDecision.status=UNIFORM_NO_APPLY`, NÃO gere dose positiva de calcário. Se `status=SPATIAL` e `automaticGeneralDoseAllowed=true`, inclua exatamente uma recomendação `CALCARIO_PRNT100` usando `operationalGeneralDoseTonHaPrnt100`; essa média já foi calculada pelo motor e NÃO deve ser refeita pelo modelo. Preserve as doses por ponto em `managementPractices`. Se `status=BLOCKED`, não gere calcário e registre a limitação em `missingInformation`.",
    "Uma dose em PRNT 100% é necessidade agronômica, não um produto comercial. Nunca converta para um calcário real sem PRNT declarado e nunca escolha marca/fonte por conta própria.",
    "`analysis.plannedManagementNotes` é contexto OPCIONAL do manejo futuro (cultivar, fertilizante, fungicida, inseticida, bioinsumo etc.). Se vazio, não trate como pendência e não bloqueie o parecer. Se preenchido, use apenas para contextualizar práticas/alertas compatíveis com as fontes; nunca altere P/K/S/calagem determinísticos por conta própria.",
    "`analysis.fertilityPlanningHorizonYears` e `analysis.fertilityCyclePlanNotes` descrevem o CICLO ENTRE ANÁLISES, não a meta de uma única safra. Use-os somente para explicar correção/construção do solo e manutenção ao longo do tempo. Nunca multiplique uma dose anual pelo número de anos nem trate a meta da próxima safra como necessidade acumulada do ciclo sem saída determinística específica.",
    "Correção inicial e manutenção são conceitos distintos. Se o produtor fizer apenas a correção e não repuser nutrientes nas safras seguintes, descreva isso como risco de balanço negativo/manutenção não atendida; NÃO estime uma produtividade média futura nem prometa quantos anos o solo sustentará um teto sem nova evidência.",
    "Nunca transforme maioria simples, média de pontos ou 50% de concordância em classe uniforme. Se `uniformPkReadiness` bloquear por ausência de predominância estrita, mantenha a heterogeneidade explícita.",
    "Se uma regra exigir meta produtiva e `season.yieldGoal`/`yieldGoalUnit` estiverem ausentes ou não suportados, não assuma produtividade de referência, média regional ou meta implícita.",
    "`season.technologyLevel` é metadado/cenário e NÃO é multiplicador de dose. Não aumente ou reduza adubação apenas por BAIXO/MEDIO/ALTO sem uma regra quantitativa homologada.",
    "Taxa variável é um fluxo separado e sob demanda. Este provedor gera recomendação por hectare no contexto da análise; não crie mapa, zona, pixel ou dose espacial sem uma solicitação espacial explícita e um gate espacial próprio.",
    "Um array `recommendations` vazio é correto quando a evidência não sustenta uma quantidade defensável.",
    "Em `diagnosis`, preserve valor/unidade reais e use a classificação da interpretação determinística. Não faça conversão implícita.",
    "Cite em `sources` exclusivamente entradas recebidas em `technicalSources`, mantendo título/instituição reais.",
    "Para cada recomendação válida, explique em `rationale` qual regra e quais entradas reais sustentaram a quantidade. Quantidade sempre por hectare, nunca total absoluto da fazenda.",
    "Práticas de manejo também precisam ser sustentadas pelo contexto/evidência; não transforme hipótese em recomendação oficial.",
    "Responda SOMENTE com JSON válido, sem texto antes/depois, exatamente no formato:",
    `{"summary": string, "diagnosis": [{"parameterCode": string, "value": number, "unit": string, "interpretation": string, "rationale": string}], "recommendations": [{"inputType": string, "quantity": number, "unit": string, "rationale": string}], "managementPractices": string[], "missingInformation": string[], "sources": [{"title": string, "institution": string|null, "url": string|null}]}`,
  ].join("\n\n");
}

function buildUserMessage(evidence: AgronomicPrescriptionEvidencePackage): string {
  return `Evidências reais autorizadas para esta prescrição:\n\n${JSON.stringify(evidence, null, 2)}`;
}

function extractJsonText(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  const textBlocks = content.filter((block): block is { type: string; text: string } => Boolean(block) && typeof block === "object" && (block as { type?: unknown }).type === "text");
  if (!textBlocks.length) return null;
  const raw = textBlocks[textBlocks.length - 1].text.trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : raw).trim();
}

export const claudePrescriptionProvider: AgronomicPrescriptionProvider = {
  name: "anthropic",
  model: process.env.AGRONOMIC_PRESCRIPTION_MODEL ?? "claude-opus-5",
  isRealLanguageModel: true,

  async prescribe(request: AgronomicPrescriptionRequest): Promise<AgronomicPrescriptionProviderResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    const model = this.model;

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 8000,
        system: buildSystemPrompt(),
        messages: [{ role: "user", content: buildUserMessage(request.evidence) }],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`Anthropic API respondeu ${response.status}: ${errorBody.slice(0, 500)}`);
    }

    const payload = await response.json() as { content?: unknown; usage?: { input_tokens?: number; output_tokens?: number } };
    const jsonText = extractJsonText(payload.content);
    if (!jsonText) throw new Error("Resposta da IA não continha bloco de texto — formato inesperado.");

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error("Resposta da IA não é um JSON válido — nada foi salvo.");
    }

    const prescription = validateAgronomicPrescription(parsed);
    if (!prescription) throw new Error("Resposta da IA não corresponde ao formato exigido — nada foi salvo.");

    const inputTokens = payload.usage?.input_tokens ?? 0;
    const outputTokens = payload.usage?.output_tokens ?? 0;

    return {
      prescription,
      provider: "anthropic",
      model,
      promptVersion: PROMPT_VERSION,
      generatedAt: new Date().toISOString(),
      isRealLanguageModel: true,
      tokensUsed: inputTokens + outputTokens || undefined,
    };
  },
};
