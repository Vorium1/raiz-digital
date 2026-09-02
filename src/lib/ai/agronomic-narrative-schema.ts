/**
 * Formato obrigatório de qualquer resposta da IA agronômica. Texto livre
 * não é aceito — todo provedor (o de hoje ou um futuro real) precisa
 * devolver exatamente esta estrutura, validada antes de chegar à tela.
 */
export type AgronomicNarrative = {
  summary: string;
  observations: string[];
  trends: string[];
  attentionPoints: string[];
  missingInformation: string[];
  technicalReferences: string[];
  requiresProfessionalReview: boolean;
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Retorna a narrativa validada ou `null` — nunca lança, nunca deixa passar um formato parcial. */
export function validateAgronomicNarrative(value: unknown): AgronomicNarrative | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.summary !== "string" || !candidate.summary.trim()) return null;
  if (!isStringArray(candidate.observations)) return null;
  if (!isStringArray(candidate.trends)) return null;
  if (!isStringArray(candidate.attentionPoints)) return null;
  if (!isStringArray(candidate.missingInformation)) return null;
  if (!isStringArray(candidate.technicalReferences)) return null;
  if (typeof candidate.requiresProfessionalReview !== "boolean") return null;
  return {
    summary: candidate.summary,
    observations: candidate.observations,
    trends: candidate.trends,
    attentionPoints: candidate.attentionPoints,
    missingInformation: candidate.missingInformation,
    technicalReferences: candidate.technicalReferences,
    requiresProfessionalReview: candidate.requiresProfessionalReview,
  };
}
