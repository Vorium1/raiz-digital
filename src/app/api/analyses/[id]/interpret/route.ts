import { getPlatformSession } from "@/lib/auth/session";
import { InterpretationError, runInterpretationForAnalysis } from "@/lib/repositories/interpretations";
import { prepareAgronomicPrescriptionDraft } from "@/lib/workflows/agronomic-prescription-draft";

const writeRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!writeRoles.has(session.role)) return Response.json({ error: "Seu perfil não pode interpretar análises." }, { status: 403 });
  const { id } = await context.params;

  try {
    const { interpretation, engineResult } = await runInterpretationForAnalysis({ tenantId: session.tenantId, userId: session.userId, analysisId: id });

    let prescriptionDraft = null;
    let prescriptionDraftError: string | null = null;
    const draftEligible = interpretation.status === "IN_REVIEW" || interpretation.status === "APPROVED";
    if (draftEligible) {
      try {
        prescriptionDraft = await prepareAgronomicPrescriptionDraft({
          tenantId: session.tenantId,
          userId: session.userId,
          analysisId: id,
        });
      } catch (error) {
        // A interpretação determinística já foi persistida com sucesso. Falha/insuficiência no rascunho
        // nunca rebaixa nem aprova nada: apenas deixa a pendência explícita para a revisão UX 2.0.
        prescriptionDraftError = error instanceof Error ? error.message : "Não foi possível preparar o rascunho da recomendação.";
      }
    }

    return Response.json({
      interpretation,
      engineResult,
      prescriptionDraft,
      prescriptionDraftError,
      prescriptionDraftState: draftEligible ? (prescriptionDraft ? "PREPARED" : "BLOCKED") : "NOT_ELIGIBLE",
    }, { status: 201 });
  } catch (error) {
    if (error instanceof InterpretationError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível interpretar a análise." }, { status: 422 });
  }
}
