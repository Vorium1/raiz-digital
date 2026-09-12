export type InterpretationStatusTone = "success" | "review" | "waiting" | "danger" | "neutral";

/**
 * Única fonte de rótulo pro status de uma interpretação (`interpretations.status`). O texto precisa
 * explicar o estado técnico sem transformar ausência de cobertura em "erro do dado": `CALCULATED`
 * significa que o motor rodou, mas não encontrou cobertura suficiente para produzir nenhuma
 * classificação utilizável; `IN_REVIEW` significa que existe interpretação real aguardando decisão
 * profissional; `APPROVED` significa decisão técnica registrada.
 */
export const INTERPRETATION_STATUS_META: Record<string, { label: string; tone: InterpretationStatusTone }> = {
  CALCULATED: { label: "Sem cobertura técnica suficiente", tone: "waiting" },
  IN_REVIEW: { label: "Aguardando validação técnica", tone: "review" },
  APPROVED: { label: "Aprovada", tone: "success" },
  AI_GENERATED: { label: "Narrativa gerada", tone: "waiting" },
  PUBLISHED: { label: "Publicada", tone: "success" },
  SUPERSEDED: { label: "Substituída", tone: "waiting" },
};

export function interpretationStatusMeta(status: string) {
  return INTERPRETATION_STATUS_META[status] ?? { label: status, tone: "neutral" as InterpretationStatusTone };
}

export type QueueBucket = "BLOQUEADA" | "AGUARDANDO_REVISAO" | "REVISAO_EM_ANDAMENTO" | "APROVADA";

export const QUEUE_BUCKET_META: Record<QueueBucket, { label: string; tone: InterpretationStatusTone }> = {
  BLOQUEADA: { label: "Interpretação bloqueada", tone: "danger" },
  AGUARDANDO_REVISAO: { label: "Aguardando revisão", tone: "review" },
  REVISAO_EM_ANDAMENTO: { label: "Revisão em andamento", tone: "review" },
  APROVADA: { label: "Decisão aprovada", tone: "success" },
};

/**
 * Classifica uma interpretação num dos 4 grupos reais da fila de Inteligência. "Revisão em andamento"
 * só existe quando `reviewedBy` já foi preenchido mas o status continua `IN_REVIEW`; nenhum estado é
 * inventado apenas para a interface.
 */
export function interpretationQueueBucket(input: { status: string; notInterpretableReason: string | null; reviewedBy: string | null }): QueueBucket {
  if (input.status === "APPROVED") return "APROVADA";
  if (input.status === "CALCULATED" && input.notInterpretableReason) return "BLOQUEADA";
  if (input.status === "IN_REVIEW" && input.reviewedBy) return "REVISAO_EM_ANDAMENTO";
  return "AGUARDANDO_REVISAO";
}
