/**
 * Fase 4A, Bloco 3 — resposta estruturada do Assistente RAIZ.
 *
 * Crítica registrada em docs/RAIZ_2.0_FASE4_ARQUITETURA_ASSISTENTE.md (seção 6.1) antes de aceitar a lista
 * sugerida pelo diretor: `observations`/`deterministic_findings` foram fundidos em `facts` (fato bruto
 * observado/contado); `attention_points` é fato + regra determinística documentada (mesma função que
 * `available`/`attention` já cumprem em `field-overview-synthesis.ts`); `patterns` só existe quando um
 * Evidence Package Builder calculou algo real (nunca texto livre); `hypotheses` é o único campo com
 * liberdade de interpretação, e sempre vem com a evidência que sustenta e o que falta pra confirmar.
 *
 * Este arquivo é deliberadamente puro (zero import de banco/sessão) para poder ser testado com
 * `node --experimental-strip-types` sem precisar de banco real.
 */

import type { AssistantAction } from "@/lib/ai/assistant-actions-schema";

export type AssistantFact = { label: string; value: string; source: "database" };
export type AssistantAttentionPoint = { label: string; reason: string };
export type AssistantPattern = { description: string; ruleRef: string };
export type AssistantHypothesis = { statement: string; supportingEvidence: string[]; missingToConfirm: string[] };
export type AssistantTechnicalReference = { title: string; institution: string | null };
export type AssistantCard = { title: string; description: string; href?: string };

export type AssistantStructuredResponse = {
  summary: string;
  facts: AssistantFact[];
  attention_points: AssistantAttentionPoint[];
  /** Só preenchido quando um Evidence Package Builder calculou algo real (ex.: `computeParameterPredominance`)
   *  — nunca um campo que o provider preenche livremente. */
  patterns: AssistantPattern[];
  /** Nesta etapa (Bloco 3, provider local/determinístico), normalmente vazio -- o intent-matcher local não
   *  produz interpretação nova, só organiza dado real. Fica reservado pra quando houver LLM real (fora
   *  desta fase). */
  hypotheses: AssistantHypothesis[];
  missing_information: string[];
  technical_references: AssistantTechnicalReference[];
  /** Bloco 4 — o que o PROVIDER sugere, ainda cru/não validado (`AssistantAction`, `assistant-actions-
   *  schema.ts`). NUNCA chega ao client neste formato: `src/app/api/assistant/route.ts` revalida cada
   *  item (`validateAssistantAction`) antes de responder -- o wire format final troca este array pela
   *  versão já resolvida (`ResolvedAssistantAction[]`, com `href` só depois de posse/tenant confirmados). */
  suggested_actions: AssistantAction[];
  /** Calculado por código (ver `computeRequiresProfessionalReview` abaixo), nunca pelo provider -- o
   *  diretor pediu explicitamente pra não usar heurística textual tipo "se parece recomendação". */
  requires_professional_review: boolean;
  /** LEGADO (documentado, não removido) -- navegação determinística que já existia antes da Fase 4A, com
   *  `href` computado inteiramente pelo próprio provider local determinístico (nunca sugerido por um
   *  modelo). Continua alimentando as intenções que já usavam isso; `suggested_actions`/
   *  `ResolvedAssistantAction` (Bloco 4) é o mecanismo OFICIAL novo daqui pra frente -- um futuro provider
   *  de LLM real nunca deve poder popular `cards.href` diretamente, só `suggested_actions` (que sempre
   *  passa pela validação server-side antes de virar link). */
  cards: AssistantCard[];
};

/**
 * Regra explícita e determinística (não heurística textual), exatamente como pedido:
 * - resposta apenas operacional/factual (sem hipótese) -> revisão não necessária;
 * - qualquer hipótese agronômica -> revisão necessária;
 * - qualquer futura recomendação agronômica (campo que ainda não existe nesta etapa) -> revisão necessária.
 *
 * Nesta etapa (Bloco 3), o provider local nunca gera `hypotheses`, então isso normalmente resolve `false`.
 */
export function computeRequiresProfessionalReview(response: Pick<AssistantStructuredResponse, "hypotheses">): boolean {
  return response.hypotheses.length > 0;
}

/**
 * Correção do diretor (arquitetura, seção 5.4) -- `field_ndvi_snapshots` só agrega vigor por talhão inteiro
 * (`mean/min/max NDVI`, `zoneBreakdownPct` percentual), sem geometria/raster/polígono de zona. Esta função é
 * o único lugar autorizado a descrever a relação entre NDVI e outro dado do mesmo talhão -- ela NUNCA
 * afirma coincidência espacial, só coexistência, e sempre declara a limitação em `missing_information`.
 * Existe como função isolada (em vez de texto solto espalhado pelo código) justamente para poder ser
 * testada: nenhum texto gerado por ela pode conter uma afirmação de coincidência espacial confirmada.
 */
export function describeNdviFieldCoexistence(input: { hasNdviData: boolean; hasLowParameterPoints: boolean; parameterCode?: string }): { note: string; missingInformation: string } | null {
  if (!input.hasNdviData || !input.hasLowParameterPoints) return null;
  const parameterLabel = input.parameterCode ? `pontos classificados como baixos para ${input.parameterCode}` : "pontos classificados como baixos";
  return {
    note: `Este talhão tem leitura de satélite (NDVI) registrada e também tem ${parameterLabel} — os dois fatos coexistem no mesmo talhão, mas isso NÃO é uma coincidência espacial confirmada.`,
    missingInformation: "Não é possível afirmar coincidência espacial entre a região de menor vigor e os pontos de amostragem — falta uma camada de NDVI espacial georreferenciada (raster/polígono por zona de vigor); os snapshots atuais só agregam vigor por talhão inteiro, sem localizar zonas.",
  };
}
