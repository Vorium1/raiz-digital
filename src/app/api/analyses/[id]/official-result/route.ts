import { getPlatformSession } from "@/lib/auth/session";
import { getAnalysisEvidenceState } from "@/lib/repositories/analysis-evidence";
import { getLatestAgronomicPrescription } from "@/lib/repositories/ai-generations";
import { getLatestInterpretation, runInterpretationForAnalysis } from "@/lib/repositories/interpretations";
import { getAgronomicPrescriptionFreshness } from "@/lib/repositories/prescription-freshness";
import { prepareAgronomicPrescriptionDraft } from "@/lib/workflows/agronomic-prescription-draft";
import { assertReportPublicationReady, ReportPublicationGateError } from "@/lib/repositories/report-publication-gate";
import { publishPremiumFieldAnalysisReport } from "@/lib/repositories/premium-report-publication";
import { AiGenerationError } from "@/lib/repositories/ai-generations";
import { InterpretationError } from "@/lib/repositories/interpretations";
import { ReportError } from "@/lib/repositories/reports";

const allowedRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);

/**
 * Fluxo oficial RAIZ: um único comando sempre parte da base agronômica corrente.
 *
 * 1) recalcula a interpretação determinística se laudo/perfil/regras mudaram;
 * 2) gera uma prescrição exclusivamente pelo provider determinístico local;
 * 3) a prescrição determinística é validada/promovida pelos gates centrais;
 * 4) publica snapshot imutável v3 vinculado à prescrição exata (migration 038).
 *
 * Relatórios antigos nunca são reescritos. Se a base técnica mudar, uma nova chamada cria
 * uma nova decisão/versionamento oficial.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!allowedRoles.has(session.role)) {
    return Response.json({ error: "Seu perfil não pode gerar o laudo oficial RAIZ." }, { status: 403 });
  }

  const { id: analysisId } = await context.params;

  try {
    let evidence = await getAnalysisEvidenceState({
      tenantId: session.tenantId,
      userId: session.userId,
      analysisId,
    });
    if (!evidence.analysisExists) return Response.json({ error: "Análise não encontrada." }, { status: 404 });

    let interpretation = await getLatestInterpretation(session.tenantId, analysisId, session.userId);
    const interpretationCurrent = Boolean(
      interpretation?.id
      && evidence.interpretationId === interpretation.id
      && evidence.freshness.current
      && interpretation.status === "APPROVED",
    );

    if (!interpretationCurrent) {
      const recalculated = await runInterpretationForAnalysis({
        tenantId: session.tenantId,
        userId: session.userId,
        analysisId,
      });
      interpretation = await getLatestInterpretation(session.tenantId, analysisId, session.userId);
      evidence = await getAnalysisEvidenceState({
        tenantId: session.tenantId,
        userId: session.userId,
        analysisId,
      });

      if (!recalculated.engineResult.interpretable || interpretation?.status !== "APPROVED" || !evidence.freshness.current) {
        return Response.json(
          {
            error: recalculated.engineResult.pendencies?.[0]
              ?? "A base atual ainda não sustenta um laudo oficial determinístico.",
            code: "OFFICIAL_RESULT_AGRONOMY_BLOCKED",
            pendencies: recalculated.engineResult.pendencies ?? [],
          },
          { status: 409 },
        );
      }
    }

    let prescription = await getLatestAgronomicPrescription(session.tenantId, analysisId, session.userId);
    let prescriptionFreshness = prescription
      ? await getAgronomicPrescriptionFreshness({
          tenantId: session.tenantId,
          userId: session.userId,
          analysisId,
          generationId: prescription.id,
        })
      : null;

    if (!prescription || prescription.status !== "APPROVED" || prescriptionFreshness?.current !== true) {
      await prepareAgronomicPrescriptionDraft({
        tenantId: session.tenantId,
        userId: session.userId,
        analysisId,
        mode: "deterministic",
      });
      prescription = await getLatestAgronomicPrescription(session.tenantId, analysisId, session.userId);
      prescriptionFreshness = prescription
        ? await getAgronomicPrescriptionFreshness({
            tenantId: session.tenantId,
            userId: session.userId,
            analysisId,
            generationId: prescription.id,
          })
        : null;
    }

    if (!interpretation?.id || !prescription?.id || prescription.status !== "APPROVED" || prescriptionFreshness?.current !== true) {
      return Response.json(
        {
          error: prescriptionFreshness?.reason
            ?? "A conclusão determinística não ficou pronta para publicação.",
          code: "OFFICIAL_RESULT_PRESCRIPTION_BLOCKED",
        },
        { status: 409 },
      );
    }

    await assertReportPublicationReady(session.tenantId, interpretation.id, session.userId);
    const report = await publishPremiumFieldAnalysisReport({
      tenantId: session.tenantId,
      userId: session.userId,
      interpretationId: interpretation.id,
    });

    return Response.json({
      report,
      alreadyPublished: report.alreadyCurrent,
      analysisId,
      interpretationId: interpretation.id,
      prescriptionId: prescription.id,
      recalculatedWithCurrentKnowledge: true,
    }, { status: report.alreadyCurrent ? 200 : 201 });
  } catch (error) {
    if (error instanceof InterpretationError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof AiGenerationError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof ReportPublicationGateError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof ReportError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json(
      { error: error instanceof Error ? error.message : "Não foi possível gerar o laudo oficial RAIZ." },
      { status: 422 },
    );
  }
}
