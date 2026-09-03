/**
 * Formato obrigatório de uma prescrição gerada por IA. Ao contrário de
 * `AgronomicNarrative` (que só explica um fato já calculado), este formato
 * TEM onde colocar dose e insumo -- de propósito, porque aqui a IA está
 * fazendo o trabalho de diagnóstico e prescrição que hoje nenhum motor
 * determinístico faz. A salvaguarda não é o tipo impedir a dose (como na
 * narrativa); é o fluxo: toda prescrição nasce PENDING_REVIEW em
 * `ai_generations`, nunca vira `input_recommendations` (a tabela "oficial")
 * sem um profissional aprovar -- ver `reviewAgronomicPrescription`.
 */
export type AgronomicPrescriptionDiagnosisItem = {
  parameterCode: string;
  value: number;
  unit: string;
  interpretation: string;
  rationale: string;
};

export type AgronomicPrescriptionRecommendation = {
  inputType: string;
  quantity: number;
  unit: string;
  rationale: string;
};

export type AgronomicPrescriptionSource = {
  title: string;
  institution: string | null;
  url: string | null;
};

export type AgronomicPrescription = {
  summary: string;
  diagnosis: AgronomicPrescriptionDiagnosisItem[];
  recommendations: AgronomicPrescriptionRecommendation[];
  managementPractices: string[];
  missingInformation: string[];
  sources: AgronomicPrescriptionSource[];
};

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateDiagnosisItem(value: unknown): AgronomicPrescriptionDiagnosisItem | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (!isString(candidate.parameterCode)) return null;
  if (!isFiniteNumber(candidate.value)) return null;
  if (!isString(candidate.unit)) return null;
  if (!isString(candidate.interpretation)) return null;
  if (!isString(candidate.rationale)) return null;
  return { parameterCode: candidate.parameterCode, value: candidate.value, unit: candidate.unit, interpretation: candidate.interpretation, rationale: candidate.rationale };
}

function validateRecommendation(value: unknown): AgronomicPrescriptionRecommendation | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (!isString(candidate.inputType)) return null;
  if (!isFiniteNumber(candidate.quantity) || candidate.quantity <= 0) return null;
  if (!isString(candidate.unit)) return null;
  if (!isString(candidate.rationale)) return null;
  return { inputType: candidate.inputType, quantity: candidate.quantity, unit: candidate.unit, rationale: candidate.rationale };
}

function validateSource(value: unknown): AgronomicPrescriptionSource | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (!isString(candidate.title)) return null;
  const institution = typeof candidate.institution === "string" && candidate.institution.trim() ? candidate.institution : null;
  const url = typeof candidate.url === "string" && candidate.url.trim() ? candidate.url : null;
  return { title: candidate.title, institution, url };
}

/** Retorna a prescrição validada ou `null` -- nunca lança, nunca deixa passar um formato parcial. */
export function validateAgronomicPrescription(value: unknown): AgronomicPrescription | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (!isString(candidate.summary)) return null;
  if (!Array.isArray(candidate.diagnosis)) return null;
  const diagnosis = candidate.diagnosis.map(validateDiagnosisItem);
  if (diagnosis.some((item) => item === null)) return null;
  if (!Array.isArray(candidate.recommendations)) return null;
  const recommendations = candidate.recommendations.map(validateRecommendation);
  if (recommendations.some((item) => item === null)) return null;
  if (!isStringArray(candidate.managementPractices)) return null;
  if (!isStringArray(candidate.missingInformation)) return null;
  if (!Array.isArray(candidate.sources)) return null;
  const sources = candidate.sources.map(validateSource);
  if (sources.some((item) => item === null)) return null;
  return {
    summary: candidate.summary,
    diagnosis: diagnosis as AgronomicPrescriptionDiagnosisItem[],
    recommendations: recommendations as AgronomicPrescriptionRecommendation[],
    managementPractices: candidate.managementPractices,
    missingInformation: candidate.missingInformation,
    sources: sources as AgronomicPrescriptionSource[],
  };
}
