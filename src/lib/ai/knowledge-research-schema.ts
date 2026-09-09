/**
 * Formato obrigatório do resultado de uma pesquisa periódica da base de
 * conhecimento. Cada item vira uma linha em `technical_sources`, sempre
 * como DRAFT -- nunca citável por um laudo até um curador da plataforma
 * homologar (mesma trava que já existe pra qualquer fonte técnica).
 */
export type KnowledgeResearchSource = {
  title: string;
  institution: string | null;
  editionYear: number | null;
  subject: string;
  content: string;
  regionCode: string | null;
};

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateKnowledgeResearchSources(value: unknown): KnowledgeResearchSource[] | null {
  if (!Array.isArray(value)) return null;
  const sources: KnowledgeResearchSource[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const candidate = item as Record<string, unknown>;
    if (!isString(candidate.title)) return null;
    if (!isString(candidate.subject)) return null;
    if (!isString(candidate.content)) return null;
    const institution = typeof candidate.institution === "string" && candidate.institution.trim() ? candidate.institution : null;
    const editionYear = typeof candidate.editionYear === "number" && Number.isFinite(candidate.editionYear) ? candidate.editionYear : null;
    const regionCode = typeof candidate.regionCode === "string" && candidate.regionCode.trim() ? candidate.regionCode : null;
    sources.push({ title: candidate.title, institution, editionYear, subject: candidate.subject, content: candidate.content, regionCode });
  }
  return sources;
}
