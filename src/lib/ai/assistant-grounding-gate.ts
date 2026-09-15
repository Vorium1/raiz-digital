import { catalogText, type EvidenceCatalog } from "@/lib/ai/assistant-evidence-catalog";
import { SPATIAL_COINCIDENCE_PATTERNS, CAUSALITY_PATTERNS, URL_PATTERN, MARKDOWN_LINK_PATTERN, PRESCRIPTION_PATTERNS, UUID_TOKEN } from "@/lib/ai/assistant-grounding-patterns";
import { numericTokens, normalizeForGrounding } from "@/lib/ai/assistant-grounding-tokens";
import type { OperationalAssistantResponse } from "@/lib/ai/operational-assistant-provider";

/**
 * Fase 4F, item 6 — grounding guard sobre TEXTO LIVRE (`summary`, e defensivamente `missing_information`/
 * `hypotheses[].statement`, que continuam sendo gerados livremente por um provider generativo mesmo depois
 * do Evidence Catalog (Bloco 3) cobrir fatos/pontos de atenção/padrões/fontes). Roda ANTES do client
 * receber a resposta.
 *
 * Regra explícita do diretor: quando o gate reprova, **nunca tenta "consertar" a saída com outro texto
 * gerativo** -- só reprova (`ok:false`), e quem chama decide o fallback (`grounded-operational-assistant-
 * provider.ts` troca pelo provider local determinístico inteiro, nunca um remendo no mesmo texto).
 */

export type GroundingViolation = { rule: string; detail: string };

function catalogHaystack(catalog: EvidenceCatalog): string {
  return normalizeForGrounding(catalogText(catalog));
}

/** Checa UM texto livre contra o catálogo. Reaproveitado tanto pro `summary` quanto (defensivamente) pra
 *  `missing_information`/hipóteses -- mesma superfície de risco (texto que um modelo escreveu livremente). */
export function checkFreeText(text: string, catalog: EvidenceCatalog, fieldName: string): GroundingViolation[] {
  const violations: GroundingViolation[] = [];
  if (!text) return violations;

  const uuidMatches = text.match(UUID_TOKEN) ?? [];
  const knownIds = new Set(catalog.knownIds);
  for (const id of uuidMatches) {
    if (!knownIds.has(id.toLowerCase())) violations.push({ rule: "unknown_uuid", detail: `${fieldName} cita um id (${id}) que não está na evidência servida` });
  }

  const haystack = catalogHaystack(catalog);
  for (const token of numericTokens(text)) {
    if (!haystack.includes(token.toLowerCase())) violations.push({ rule: "unverified_numeric_claim", detail: `${fieldName} cita um número (${token}) não presente na evidência servida` });
  }

  for (const pattern of SPATIAL_COINCIDENCE_PATTERNS) {
    if (pattern.test(text)) violations.push({ rule: "spatial_coincidence_claim", detail: `${fieldName} afirma coincidência espacial não suportada pela evidência (padrão: ${pattern})` });
  }
  for (const pattern of CAUSALITY_PATTERNS) {
    if (pattern.test(text)) violations.push({ rule: "causality_claim", detail: `${fieldName} apresenta causalidade agronômica como fato (padrão: ${pattern})` });
  }
  if (URL_PATTERN.test(text) || MARKDOWN_LINK_PATTERN.test(text)) violations.push({ rule: "url_in_text", detail: `${fieldName} contém uma URL/link solto` });
  for (const pattern of PRESCRIPTION_PATTERNS) {
    if (pattern.test(text)) violations.push({ rule: "prescription_out_of_scope", detail: `${fieldName} soa como recomendação/prescrição, fora do escopo do Assistente RAIZ (padrão: ${pattern})` });
  }

  // Nome de entidade não presente na evidência -- melhor esforço (só sequências de 2+ palavras
  // capitalizadas consecutivas, o padrão típico de nome próprio em português; texto normal raramente
  // capitaliza 2 palavras seguidas fora de um nome real).
  const entityCandidates = text.match(/\b[A-ZÀ-Ý][a-zà-ÿ]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ]+)+\b/g) ?? [];
  for (const candidate of entityCandidates) {
    const known = catalog.knownEntityNames.some((n) => n.toLowerCase().includes(candidate.toLowerCase()) || candidate.toLowerCase().includes(n.toLowerCase()));
    if (!known) violations.push({ rule: "unknown_entity_name", detail: `${fieldName} cita uma entidade ("${candidate}") não presente na evidência servida` });
  }

  return violations;
}

/**
 * Checa a resposta INTEIRA (summary + missing_information + hipóteses) -- retorna todas as violações
 * encontradas, ou `[]` quando está tudo grounded. Nunca modifica a resposta -- só relata.
 */
export function checkResponseGrounding(response: Pick<OperationalAssistantResponse, "summary" | "missing_information" | "hypotheses">, catalog: EvidenceCatalog): GroundingViolation[] {
  const violations: GroundingViolation[] = [...checkFreeText(response.summary, catalog, "summary")];
  response.missing_information.forEach((text, i) => violations.push(...checkFreeText(text, catalog, `missing_information[${i}]`)));
  response.hypotheses.forEach((h, i) => violations.push(...checkFreeText(h.statement, catalog, `hypotheses[${i}].statement`)));
  return violations;
}
