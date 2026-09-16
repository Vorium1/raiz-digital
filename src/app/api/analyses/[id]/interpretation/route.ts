import { getPlatformSession } from "@/lib/auth/session";
import { getAnalysisEvidenceState } from "@/lib/repositories/analysis-evidence";
import { getLatestInterpretation, listInterpretationHistory } from "@/lib/repositories/interpretations";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const { id } = await context.params;

  const [latest, history, evidence] = await Promise.all([
    getLatestInterpretation(session.tenantId, id, session.userId),
    listInterpretationHistory(session.tenantId, id, session.userId),
    getAnalysisEvidenceState({ tenantId: session.tenantId, userId: session.userId, analysisId: id }),
  ]);
  return Response.json({
    latest,
    history,
    evidenceFreshness: evidence.interpretationId === latest?.id
      ? evidence.freshness
      : { current: false, code: "INTERPRETATION_TIMESTAMP_MISSING", reason: "A revisão exibida não pôde ser comprovada como corrente." },
  });
}
