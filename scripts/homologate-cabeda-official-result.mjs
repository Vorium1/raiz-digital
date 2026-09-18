import { getPool, withTenant } from "../src/lib/db.ts";
import { getAnalysisEvidenceState } from "../src/lib/repositories/analysis-evidence.ts";
import { getLatestAgronomicPrescription } from "../src/lib/repositories/ai-generations.ts";
import { getDecisionDeliveryStatuses } from "../src/lib/repositories/decision-delivery-status.ts";
import { getLatestInterpretation, runInterpretationForAnalysis } from "../src/lib/repositories/interpretations.ts";
import { getAgronomicPrescriptionFreshness } from "../src/lib/repositories/prescription-freshness.ts";
import { assertReportPublicationReady } from "../src/lib/repositories/report-publication-gate.ts";
import { publishPremiumFieldAnalysisReport } from "../src/lib/repositories/premium-report-publication.ts";
import { prepareAgronomicPrescriptionDraft } from "../src/lib/workflows/agronomic-prescription-draft.ts";

let tenantId = "";
let userId = "";
const expectedGuard = "PR88_CABEDA_OFFICIAL_RESULT";
const analysisCodes = ["AN-CABEDA-01", "AN-CABEDA-02", "AN-CABEDA-03"];

function requireEnv(name, value) {
  if (!value) throw new Error(`${name} não configurado no environment de homologação.`);
}

function recommendationSummary(prescription) {
  const rows = prescription?.responsePayload?.prescription?.recommendations;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item;
    if (typeof row.inputType !== "string" || typeof row.quantity !== "number" || typeof row.unit !== "string") return [];
    return [{ inputType: row.inputType, quantity: row.quantity, unit: row.unit }];
  });
}

async function assertIsolatedHomologation() {
  const client = await getPool().connect();
  try {
    const guard = await client.query(
      `SELECT
         EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='reports' AND column_name='prescription_generation_id'
         ) AS has_038,
         EXISTS (
           SELECT 1 FROM homologation_write_guard WHERE guard_key = $1
         ) AS has_guard`,
      [expectedGuard],
    );
    const state = guard.rows[0];
    if (!state?.has_038 || !state?.has_guard) {
      throw new Error("WRITE_GUARD_REFUSED: banco não é a homologação isolada preparada para o PR #88.");
    }

    const analyses = await client.query(
      `SELECT a.id::text, a.code, a.tenant_id::text AS "tenantId", a.created_by::text AS "createdBy"
       FROM analyses a
       WHERE a.code = ANY($1::text[])
       ORDER BY a.code`,
      [analysisCodes],
    );
    if (analyses.rows.length !== analysisCodes.length) {
      throw new Error(`WRITE_GUARD_REFUSED: esperado ${analysisCodes.length} análises Cabeda, encontradas ${analyses.rows.length}.`);
    }

    const tenantIds = [...new Set(analyses.rows.map((row) => row.tenantId).filter(Boolean))];
    const actorIds = [...new Set(analyses.rows.map((row) => row.createdBy).filter(Boolean))];
    if (tenantIds.length !== 1 || actorIds.length !== 1) {
      throw new Error("WRITE_GUARD_REFUSED: análises Cabeda não compartilham tenant/ator de homologação únicos.");
    }
    tenantId = tenantIds[0];
    userId = actorIds[0];
    return analyses.rows.map(({ id, code }) => ({ id, code }));
  } finally {
    client.release();
  }
}

async function ensureOfficialResult(analysisId, code) {
  let evidence = await getAnalysisEvidenceState({ tenantId, userId, analysisId });
  let interpretation = await getLatestInterpretation(tenantId, analysisId, userId);
  let recalculated = false;

  const currentInterpretation = Boolean(
    interpretation?.id
      && evidence.interpretationId === interpretation.id
      && evidence.freshness.current
      && interpretation.status === "APPROVED",
  );

  if (!currentInterpretation) {
    const result = await runInterpretationForAnalysis({ tenantId, userId, analysisId });
    recalculated = true;
    interpretation = await getLatestInterpretation(tenantId, analysisId, userId);
    evidence = await getAnalysisEvidenceState({ tenantId, userId, analysisId });
    if (!result.engineResult.interpretable || interpretation?.status !== "APPROVED" || !evidence.freshness.current) {
      return {
        code,
        status: "AGRONOMY_BLOCKED",
        pendencies: result.engineResult.pendencies ?? [],
      };
    }
  }

  let prescription = await getLatestAgronomicPrescription(tenantId, analysisId, userId);
  let freshness = prescription
    ? await getAgronomicPrescriptionFreshness({ tenantId, userId, analysisId, generationId: prescription.id })
    : null;

  if (!prescription || prescription.status !== "APPROVED" || freshness?.current !== true) {
    await prepareAgronomicPrescriptionDraft({ tenantId, userId, analysisId, mode: "deterministic" });
    prescription = await getLatestAgronomicPrescription(tenantId, analysisId, userId);
    freshness = prescription
      ? await getAgronomicPrescriptionFreshness({ tenantId, userId, analysisId, generationId: prescription.id })
      : null;
  }

  if (!interpretation?.id || !prescription?.id || prescription.status !== "APPROVED" || freshness?.current !== true) {
    return {
      code,
      status: "PRESCRIPTION_BLOCKED",
      reason: freshness?.reason ?? "Prescrição determinística não ficou corrente/aprovada.",
    };
  }

  const before = (await getDecisionDeliveryStatuses(tenantId, [analysisId], userId))[0];
  let publishedNow = false;
  let report = null;
  if ((before?.currentReportCount ?? 0) === 0) {
    await assertReportPublicationReady(tenantId, interpretation.id, userId);
    report = await publishPremiumFieldAnalysisReport({ tenantId, userId, interpretationId: interpretation.id });
    publishedNow = true;
  }

  const after = (await getDecisionDeliveryStatuses(tenantId, [analysisId], userId))[0];
  return {
    code,
    status: (after?.currentReportCount ?? 0) > 0 ? "OFFICIAL" : "NOT_OFFICIAL",
    recalculated,
    publishedNow,
    interpretationStatus: interpretation.status,
    prescriptionStatus: prescription.status,
    recommendations: recommendationSummary(prescription),
    currentReportCount: after?.currentReportCount ?? 0,
    reportRevision: report?.revision ?? null,
  };
}

async function main() {
  requireEnv("DATABASE_URL/APP_DATABASE_URL", (process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL)?.trim() ?? "");

  const analyses = await assertIsolatedHomologation();
  const results = [];
  for (const analysis of analyses) {
    results.push(await ensureOfficialResult(analysis.id, analysis.code));
  }

  console.log(JSON.stringify({
    environment: "isolated-homologation",
    guard: expectedGuard,
    results,
  }, null, 2));

  if (results.some((item) => item.status !== "OFFICIAL")) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPool().end().catch(() => {});
  });
