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
