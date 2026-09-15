export type StatusTone = "review" | "danger" | "waiting" | "success" | "neutral";

const STATUS: Record<string, { label: string; tone: StatusTone; progress: number }> = {
  DRAFT: { label: "Rascunho", tone: "neutral", progress: 8 },
  COLLECTION_SCHEDULED: { label: "Coleta programada", tone: "waiting", progress: 16 },
  COLLECTION_IN_PROGRESS: { label: "Coleta em andamento", tone: "waiting", progress: 24 },
  AWAITING_LAB: { label: "Aguardando laboratório", tone: "waiting", progress: 34 },
  IMPORTED: { label: "Laudo importado", tone: "waiting", progress: 46 },
  INCONSISTENT: { label: "Com inconsistências", tone: "danger", progress: 46 },
  READY_TO_INTERPRET: { label: "Pronta para interpretar", tone: "waiting", progress: 58 },
  INTERPRETED: { label: "Interpretada", tone: "review", progress: 70 },
  AWAITING_REVIEW: { label: "Aguardando revisão", tone: "review", progress: 82 },
  APPROVED: { label: "Aprovada", tone: "success", progress: 92 },
  REPORT_SENT: { label: "Relatório enviado", tone: "success", progress: 100 },
  ARCHIVED: { label: "Arquivada", tone: "neutral", progress: 100 },
};

export function analysisStatusMeta(status: string) {
  return STATUS[status] ?? { label: status, tone: "neutral" as StatusTone, progress: 0 };
}

/**
 * Status "de exibição" real da análise -- corrige um bug real confirmado na auditoria de UX (item C):
 * `analyses.status = 'READY_TO_INTERPRET'` (rótulo "Pronta para interpretar") é gravado exatamente quando
 * o motor determinístico JÁ RODOU e NÃO achou nenhum parâmetro interpretável (ver
 * `runInterpretationForAnalysis` em `src/lib/repositories/interpretations.ts`) -- ou seja, o nome do status
 * mente sobre o que já aconteceu. Esta função usa o status REAL da última interpretação (quando disponível)
 * pra decidir o rótulo mostrado, em vez de confiar cegamente no enum solto de `analyses.status`.
 */
export function analysisDisplayStatus(input: { status: string; latestInterpretationStatus?: string | null; notInterpretableReason?: string | null }) {
  if (input.status === "READY_TO_INTERPRET" && input.latestInterpretationStatus === "CALCULATED" && input.notInterpretableReason) {
    return { label: "Calculado, sem parâmetro interpretável", tone: "waiting" as StatusTone, progress: 58, detail: input.notInterpretableReason };
  }
  return { ...analysisStatusMeta(input.status), detail: null as string | null };
}

export const ANALYSIS_STATUS_OPTIONS = Object.entries(STATUS).map(([value, meta]) => ({ value, label: meta.label }));

export function formatRelativeOrDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}
