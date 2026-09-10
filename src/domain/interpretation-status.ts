export type InterpretationStatusTone = "success" | "review" | "waiting" | "danger" | "neutral";

/**
 * Única fonte de rótulo pro status de uma interpretação (`interpretations.status`). Antes duas telas
 * (`agronomic-intelligence-panel.tsx` e `inteligencia/page.tsx`) tinham cada uma seu próprio Record com
 * um texto DIFERENTE pro MESMO valor de banco -- achado real confirmado na auditoria de UX (item C).
 * No pipeline real desta base (`runInterpretationForAnalysis` em `src/lib/repositories/interpretations.ts`),
 * `CALCULATED` só acontece quando o motor determinístico NÃO encontrou nenhum parâmetro interpretável --
 * por isso o rótulo precisa dizer isso, nunca algo como "sem revisão" (que sugere que só falta um humano
 * olhar, quando na verdade o motor já rodou e não achou nada pra interpretar).
 */
export const INTERPRETATION_STATUS_META: Record<string, { label: string; tone: InterpretationStatusTone }> = {
  CALCULATED: { label: "Calculado, sem parâmetro interpretável", tone: "waiting" },
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
  BLOQUEADA: { label: "Dado impede interpretação", tone: "danger" },
  AGUARDANDO_REVISAO: { label: "Calculada, aguardando revisão", tone: "review" },
  REVISAO_EM_ANDAMENTO: { label: "Revisão em andamento", tone: "review" },
  APROVADA: { label: "Aprovada", tone: "success" },
};

/**
 * Classifica uma interpretação num dos 4 grupos reais da fila de Inteligência (Fase 2.0 Fase 3, Bloco
 * A) -- nunca um 5º estado inventado na tela. "Revisão em andamento" só existe quando o dado persistido
 * já tem `reviewedBy` preenchido mas o status continua `IN_REVIEW` (alguém já olhou e devolveu, via
 * `reviewInterpretation({approve:false})`) -- é uma combinação real de campos já gravados no banco, não
 * um estado novo criado só na interface.
 */
export function interpretationQueueBucket(input: { status: string; notInterpretableReason: string | null; reviewedBy: string | null }): QueueBucket {
  if (input.status === "APPROVED") return "APROVADA";
  if (input.status === "CALCULATED" && input.notInterpretableReason) return "BLOQUEADA";
  if (input.status === "IN_REVIEW" && input.reviewedBy) return "REVISAO_EM_ANDAMENTO";
  return "AGUARDANDO_REVISAO";
}
