/**
 * Gate de governança da prescrição/recomendação assistida (auditoria RAIZ_2.0/Cabeda, 2026-09-11, item 1).
 * Módulo puro (sem banco) pra ser testável isoladamente com `node --experimental-strip-types` -- a lógica
 * em si é pequena, mas é exatamente o tipo de decisão que precisa de teste explícito, não só revisão de
 * código, porque uma versão anterior deste gate aceitava `IN_REVIEW` também (errado: `IN_REVIEW` é
 * "calculado, aguardando revisão", nunca "aprovado por um profissional").
 *
 * Fluxo correto que este gate impõe:
 *   interpretação determinística -> revisão profissional (reviewInterpretation) -> APPROVED
 *     -> prescrição/recomendação assistida (só passa daqui pra frente)
 *     -> revisão/aprovação da prescrição (reviewAgronomicPrescription, já existente)
 *
 * `interpretationStatus` é `null` quando não existe nenhuma interpretação persistida pra esta análise
 * (nunca rodou o motor) -- bloqueado, igual a qualquer status diferente de `APPROVED`.
 */
export type PrescriptionGateResult = { allowed: true } | { allowed: false; reason: string };

export const PRESCRIPTION_GATE_BLOCKED_REASON =
  "É necessário ter uma interpretação técnica aprovada por um profissional (revisão concluída) antes de gerar uma prescrição assistida.";

export function checkPrescriptionGate(interpretationStatus: string | null): PrescriptionGateResult {
  if (interpretationStatus !== "APPROVED") {
    return { allowed: false, reason: PRESCRIPTION_GATE_BLOCKED_REASON };
  }
  return { allowed: true };
}
