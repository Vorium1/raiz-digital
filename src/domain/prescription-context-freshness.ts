export type PrescriptionContextFreshness = {
  current: boolean;
  reason: string | null;
};

/**
 * Uma prescrição é um snapshot das evidências disponíveis no instante da geração.
 * Se a safra foi alterada depois disso, a geração continua válida como histórico,
 * mas deixa de ser a recomendação corrente e precisa ser regenerada antes de uma
 * nova aprovação/promoção de doses.
 *
 * Falha fechada para datas inválidas: em governança agronômica, não conseguir
 * provar que a evidência é atual nunca deve ser tratado como "está tudo certo".
 */
export function evaluatePrescriptionContextFreshness(input: {
  generationCreatedAt: string | null | undefined;
  cropSeasonUpdatedAt: string | null | undefined;
}): PrescriptionContextFreshness {
  if (!input.generationCreatedAt || !input.cropSeasonUpdatedAt) {
    return { current: false, reason: "Não foi possível comprovar a atualidade do contexto da prescrição." };
  }

  const generatedAt = new Date(input.generationCreatedAt).getTime();
  const seasonUpdatedAt = new Date(input.cropSeasonUpdatedAt).getTime();
  if (!Number.isFinite(generatedAt) || !Number.isFinite(seasonUpdatedAt)) {
    return { current: false, reason: "As datas de rastreabilidade do contexto são inválidas." };
  }

  if (generatedAt < seasonUpdatedAt) {
    return {
      current: false,
      reason: "O contexto agronômico da safra mudou depois desta geração. Gere uma nova versão antes de aprovar ou promover doses.",
    };
  }

  return { current: true, reason: null };
}


/**
 * Uma prescrição só permanece corrente quando aponta para a mesma execução
 * determinística de N que era vigente no snapshot da geração.
 *
 * null === null é válido: análises sem execução de N não são forçadas a criar
 * uma. O que invalida o snapshot é a execução mudar depois.
 */
export function evaluateNitrogenExecutionSnapshotFreshness(input: {
  generationExecutionId: string | null | undefined;
  currentExecutionId: string | null | undefined;
}): PrescriptionContextFreshness {
  const generationExecutionId = input.generationExecutionId?.trim() || null;
  const currentExecutionId = input.currentExecutionId?.trim() || null;

  if (generationExecutionId !== currentExecutionId) {
    return {
      current: false,
      reason: "A execução determinística de nitrogênio mudou depois desta geração. Gere uma nova versão para refletir o cálculo corrente.",
    };
  }

  return { current: true, reason: null };
}


/**
 * Freshness do contexto opcional da análise (irrigação, planejamento, comprador etc.).
 *
 * É propositalmente separado de crop_seasons.updated_at: editar um refinamento do
 * parecer deve exigir nova narrativa, mas não deve invalidar uma execução de N cujos
 * próprios insumos continuam iguais.
 */
export function evaluateAnalysisContextFingerprintFreshness(input: {
  generationFingerprint: string | null | undefined;
  currentFingerprint: string | null | undefined;
}): PrescriptionContextFreshness {
  const generationFingerprint = input.generationFingerprint?.trim() || null;
  const currentFingerprint = input.currentFingerprint?.trim() || null;

  if (!generationFingerprint || !currentFingerprint) {
    return {
      current: false,
      reason: "Não foi possível comprovar a versão do contexto opcional da análise. Gere uma nova versão.",
    };
  }

  if (generationFingerprint !== currentFingerprint) {
    return {
      current: false,
      reason: "O contexto opcional da análise mudou depois desta geração. Gere uma nova versão para incorporar os refinamentos atuais.",
    };
  }

  return { current: true, reason: null };
}
