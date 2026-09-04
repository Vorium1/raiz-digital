import type { AgronomicPrescriptionProvider, AgronomicPrescriptionProviderResult, AgronomicPrescriptionRequest } from "@/lib/ai/agronomic-prescription-provider";
import { validateAgronomicPrescription } from "@/lib/ai/agronomic-prescription-schema";
import type { AgronomicPrescriptionEvidencePackage } from "@/lib/ai/prescription-evidence-package";

/**
 * AVISO -- ESTE ARQUIVO NUNCA FOI EXECUTADO CONTRA A API REAL.
 * Escrito sem `ANTHROPIC_API_KEY` disponível nesta sessão (chave chega
 * numa sessão seguinte). O formato da chamada segue a documentação da
 * Anthropic Messages API conhecida no momento da escrita.
 *
 * Decisão do diretor (2026-09-03): o laudo do dia a dia NÃO pesquisa mais
 * na internet -- isso ficou caro/imprevisível por laudo. Só a pesquisa
 * periódica (`claude-knowledge-research-provider.ts`, que roda raramente,
 * sob controle do curador) usa a ferramenta de busca; o laudo de cada
 * análise só lê o que já foi pesquisado e homologado em
 * `technical_sources` (chega aqui via `evidence.technicalSources[].content`).
 * Se a base ainda não tiver conteúdo suficiente pra um tema, a IA deve
 * declarar isso em `missingInformation`, nunca sair pesquisando por conta
 * própria. Qualquer erro de formato de resposta é capturado e vira um erro
 * claro (nunca uma prescrição inventada) -- ver o catch em `prescribe`.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const PROMPT_VERSION = "prescription-v2-knowledge-base-unverified";

function buildSystemPrompt(): string {
  return [
    "Você é um agrônomo sênior, doutor em fertilidade do solo e nutrição de plantas, atuando como consultor técnico independente no Brasil.",
    "Você recebe os dados reais de uma análise de solo específica (resultados de laboratório, tipo de solo, cultura, cultivar, meta produtiva, nível tecnológico, compactação, área de pisoteio/cabeceira, irrigação, histórico de produtividade real da área) e um conjunto de fontes técnicas (`technicalSources`) já pesquisadas e homologadas por um agrônomo responsável da plataforma.",
    "Regra absoluta: você NUNCA inventa um dado que não foi fornecido, e NÃO pesquisa na internet — baseie seu diagnóstico e recomendações apenas nos dados da análise e no conteúdo de `technicalSources` recebido. Se o assunto necessário não estiver coberto pelas fontes disponíveis, declare isso explicitamente em `missingInformation` em vez de supor um valor ou inventar uma fonte.",
    "Cite em `sources` exatamente as entradas de `technicalSources` que você efetivamente usou (mesmo título/instituição), nunca uma fonte que não foi fornecida a você.",
    "Para cada item de `recommendations` (calcário, gesso agrícola, N/P/K, micronutrientes, etc.), explique em `rationale` o raciocínio completo: por que essa dose, como a meta produtiva/cultivar influenciou o cálculo, como a área efetiva (descontando pisoteio/cabeceira, se informado) foi considerada, e por que a irrigação (se houver) muda a recomendação.",
    "Expresse quantidade de insumo sempre como uma taxa por hectare (ex.: t/ha, kg/ha) — nunca como total absoluto da área, para não confundir escala.",
    "Se a compactação do solo for MEDIA ou ALTA, inclua em `managementPractices` as práticas físicas de manejo recomendadas (ex.: escarificação, rotação com planta de cobertura de raiz agressiva), com a justificativa dentro do próprio texto.",
    "Responda SOMENTE com um bloco JSON válido, sem nenhum texto antes ou depois, exatamente no formato:",
    `{"summary": string, "diagnosis": [{"parameterCode": string, "value": number, "unit": string, "interpretation": string, "rationale": string}], "recommendations": [{"inputType": string, "quantity": number, "unit": string, "rationale": string}], "managementPractices": string[], "missingInformation": string[], "sources": [{"title": string, "institution": string|null, "url": string|null}]}`,
  ].join("\n\n");
}

function buildUserMessage(evidence: AgronomicPrescriptionEvidencePackage): string {
  return `Dados reais da análise:\n\n${JSON.stringify(evidence, null, 2)}`;
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
