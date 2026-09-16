/**
 * Gate de geração da recomendação RAIZ.
 *
 * A validação profissional não deve acontecer entre a interpretação e a recomendação.
 * O motor prepara o pacote completo primeiro; o agrônomo julga o conjunto no fim.
 *
 * Portanto:
 * - CALCULATED continua bloqueado: o motor rodou, mas não encontrou cobertura técnica utilizável;
 * - IN_REVIEW é permitido: existe interpretação determinística real e corrente, pronta para compor a recomendação;
 * - APPROVED/PUBLISHED também são permitidos para compatibilidade com decisões já validadas;
 * - qualquer estado inesperado falha fechado.
 */
export type PrescriptionGateResult = { allowed: true } | { allowed: false; reason: string };

export const PRESCRIPTION_GATE_BLOCKED_REASON =
  "A RAIZ ainda não possui cobertura técnica suficiente para montar uma recomendação segura. Complete os dados ou regras indicados; a validação profissional acontece depois, sobre a decisão completa.";

const REVIEWABLE_INTERPRETATION_STATUSES = new Set(["IN_REVIEW", "APPROVED", "PUBLISHED"]);

export function checkPrescriptionGate(interpretationStatus: string | null): PrescriptionGateResult {
  if (!interpretationStatus || !REVIEWABLE_INTERPRETATION_STATUSES.has(interpretationStatus)) {
    return { allowed: false, reason: PRESCRIPTION_GATE_BLOCKED_REASON };
  }
  return { allowed: true };
}
