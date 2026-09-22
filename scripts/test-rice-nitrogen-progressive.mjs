import assert from "node:assert/strict";
import { evaluateRiceContinuousNitrogenEnvelope, RESEARCH_READY_PROFILES } from "../src/domain/research-ready-rules.ts";
import { deterministicLimitedPrescriptionProvider } from "../src/lib/ai/providers/deterministic-limited-prescription-provider.ts";

const baseEvidence = {
  results: [],
  technicalSources: [],
  deterministicInterpretation: null,
  season: { cropProfileCode: "ARROZ" },
  deterministicPkDoses: {
    P2O5: { ready: false, blockers: ["TEST_NO_P"] },
    K2O: { ready: false, blockers: ["TEST_NO_K"] },
  },
};

const singleEnvelope = evaluateRiceContinuousNitrogenEnvelope({
  profileId: RESEARCH_READY_PROFILES.rice,
  organicMatterPct: 2.5,
});

const single = await deterministicLimitedPrescriptionProvider.prescribe({
  evidence: {
    ...baseEvidence,
    riceNitrogenEvidence: {
      status: "OFFICIAL_ENVELOPE",
      ruleId: singleEnvelope.ruleId,
      source: singleEnvelope.source,
      automaticDoseAllowed: false,
      responseClassResolved: false,
      blocker: singleEnvelope.blocker,
      uniformOrganicMatterBand: singleEnvelope.organicMatterBand,
      envelopes: [{
        sampleCode: "P01",
        organicMatterPct: 2.5,
        organicMatterBand: singleEnvelope.organicMatterBand,
        alternatives: singleEnvelope.alternatives,
      }],
      limitations: [],
    },
  },
});

assert.equal(single.prescription.recommendations.some((item) => item.inputType === "N"), false);
const singleManagement = single.prescription.managementPractices.join(" ");
assert.match(singleManagement, /Nitrogênio do arroz/);
assert.match(singleManagement, /Média: 110 kg N\/ha/);
assert.match(singleManagement, /Alta: 135 kg N\/ha/);
assert.match(singleManagement, /Muito alta: 165 kg N\/ha/);
assert.match(singleManagement, /não escolheu uma expectativa de resposta/);
assert.match(single.prescription.missingInformation.join(" "), /envelope oficial/);

const highEnvelope = evaluateRiceContinuousNitrogenEnvelope({
  profileId: RESEARCH_READY_PROFILES.rice,
  organicMatterPct: 5.5,
});
const lowEnvelope = evaluateRiceContinuousNitrogenEnvelope({
  profileId: RESEARCH_READY_PROFILES.rice,
  organicMatterPct: 2,
});

const multi = await deterministicLimitedPrescriptionProvider.prescribe({
  evidence: {
    ...baseEvidence,
    riceNitrogenEvidence: {
      status: "MULTI_BAND_OFFICIAL_ENVELOPE",
      ruleId: lowEnvelope.ruleId,
      source: lowEnvelope.source,
      automaticDoseAllowed: false,
      responseClassResolved: false,
      blocker: lowEnvelope.blocker,
      uniformOrganicMatterBand: null,
      envelopes: [
        {
          sampleCode: "P01",
          organicMatterPct: 2,
          organicMatterBand: lowEnvelope.organicMatterBand,
          alternatives: lowEnvelope.alternatives,
        },
        {
          sampleCode: "P02",
          organicMatterPct: 5.5,
          organicMatterBand: highEnvelope.organicMatterBand,
          alternatives: highEnvelope.alternatives,
        },
      ],
      limitations: ["RICE_N_OM_BANDS_CONFLICT_NO_UNIFORM_DOSE"],
    },
  },
});

assert.equal(multi.prescription.recommendations.some((item) => item.inputType === "N"), false);
assert.match(multi.prescription.managementPractices.join(" "), /cruzam classes de matéria orgânica/);
assert.match(multi.prescription.managementPractices.join(" "), /até 135 kg N\/ha/);
assert.match(multi.prescription.missingInformation.join(" "), /não sustentam uma dose uniforme automática/);

const notEvaluated = await deterministicLimitedPrescriptionProvider.prescribe({
  evidence: {
    ...baseEvidence,
    riceNitrogenEvidence: {
      status: "NOT_EVALUATED",
      automaticDoseAllowed: false,
      uniformOrganicMatterBand: null,
      envelopes: [],
      limitations: ["RICE_N_REQUIRES_ORGANIC_MATTER_PERCENT"],
    },
  },
});
assert.equal(notEvaluated.prescription.recommendations.some((item) => item.inputType === "N"), false);
assert.match(notEvaluated.prescription.missingInformation.join(" "), /sem bloquear o restante do parecer/);

console.log("rice-nitrogen-progressive: SOSBAI envelope is informative, multi-band safe and never auto-selects N dose");
