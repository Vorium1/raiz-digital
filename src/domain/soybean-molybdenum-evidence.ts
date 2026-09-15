import { buildRuleTrace } from "./agronomic-rule-catalog.ts";

export type SoybeanMoProfileId = "RS_SC_2025" | "EMBRAPA_BR_2020";
export type SoybeanMoApplicationMethod = "SEED" | "FOLIAR";
export type SoybeanMoRegion = "RS" | "SC" | "OTHER_BRAZIL";
export type SoybeanSoilTexture = "SANDY" | "NON_SANDY" | "UNKNOWN";

type DoseRange = { minGMoPerHa: number; maxGMoPerHa: number };

type SoybeanMoProfile = {
  profileId: SoybeanMoProfileId;
  ruleId: "MO-SOJA-RS-SC-2025" | "MO-SOJA-EMBRAPA-2020";
  geographicScope: "RS_SC" | "BRAZIL";
  sourceTitle: string;
  sourceYear: number;
  sourceLocator: string;
  sourceUrl: string;
  seedRange: DoseRange;
  foliarRange: DoseRange;
  foliarStage: "V2_V3" | "V3_V5";
  preferredMethod: "FOLIAR" | "NO_UNIQUE_PREFERENCE";
  triggerFraming: "CONDITIONAL_RESPONSE_CONTEXT" | "MINIMUM_EXPORT_EACH_CROP_CYCLE";
  annualUsePolicy: "DO_NOT_APPLY_EVERY_YEAR_IN_ILP" | "MINIMUM_EXPORT_EACH_CROP_CYCLE";
  pastureStopThresholdMgPerKg: number | null;
};

const RS_SC_2025_SOURCE = "https://www.alice.cnptia.embrapa.br/alice/bitstream/doc/1183120/1/Indicacoes2025.pdf";
const EMBRAPA_2020_SOURCE = "https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1123928/1/SP-17-2020-online-1.pdf";

/**
 * Estes perfis preservam literalmente diferenças operacionais entre fontes.
 * A RAIZ não escolhe automaticamente um perfil e não converte faixa em dose única.
 */
export const SOYBEAN_MO_PROFILES: Readonly<Record<SoybeanMoProfileId, SoybeanMoProfile>> = Object.freeze({
  RS_SC_2025: {
    profileId: "RS_SC_2025",
    ruleId: "MO-SOJA-RS-SC-2025",
    geographicScope: "RS_SC",
    sourceTitle: "Indicações técnicas para a cultura da soja no Rio Grande do Sul e em Santa Catarina, safras 2025/2026 e 2026/2027",
    sourceYear: 2025,
    sourceLocator: "item 2.5.4, pp.46-47",
    sourceUrl: RS_SC_2025_SOURCE,
    seedRange: { minGMoPerHa: 12, maxGMoPerHa: 25 },
    foliarRange: { minGMoPerHa: 25, maxGMoPerHa: 50 },
    foliarStage: "V2_V3",
    preferredMethod: "FOLIAR",
    triggerFraming: "CONDITIONAL_RESPONSE_CONTEXT",
    annualUsePolicy: "DO_NOT_APPLY_EVERY_YEAR_IN_ILP",
    pastureStopThresholdMgPerKg: 5,
  },
  EMBRAPA_BR_2020: {
    profileId: "EMBRAPA_BR_2020",
    ruleId: "MO-SOJA-EMBRAPA-2020",
    geographicScope: "BRAZIL",
    sourceTitle: "Tecnologias de produção de soja — Sistemas de Produção 17",
    sourceYear: 2020,
    sourceLocator: "p.175, seção Cobalto e molibdênio; p.189, aplicação de micronutrientes",
    sourceUrl: EMBRAPA_2020_SOURCE,
    seedRange: { minGMoPerHa: 12, maxGMoPerHa: 25 },
    foliarRange: { minGMoPerHa: 12, maxGMoPerHa: 25 },
    foliarStage: "V3_V5",
    preferredMethod: "NO_UNIQUE_PREFERENCE",
    triggerFraming: "MINIMUM_EXPORT_EACH_CROP_CYCLE",
    annualUsePolicy: "MINIMUM_EXPORT_EACH_CROP_CYCLE",
    pastureStopThresholdMgPerKg: null,
  },
});

export const SOYBEAN_MO_CONFLICT_DIMENSIONS = Object.freeze([
  "FOLIAR_DOSE_RANGE",
  "FOLIAR_GROWTH_STAGE",
  "APPLICATION_FREQUENCY",
  "TRIGGER_FRAMING",
  "ILP_PASTURE_SAFETY_POLICY",
] as const);

function validateOptionalPh(value: number | null) {
  if (value === null) return;
  if (!Number.isFinite(value) || value < 0 || value > 14) {
    throw new Error("pH em água deve ser nulo ou um número finito entre 0 e 14.");
  }
}

function validateOptionalNonNegative(value: number | null, label: string) {
  if (value === null) return;
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} deve ser nulo ou finito e >=0.`);
}

export function getSoybeanMoProfile(profileId: SoybeanMoProfileId): SoybeanMoProfile {
  const profile = SOYBEAN_MO_PROFILES[profileId];
  if (!profile) throw new Error(`Perfil de molibdênio da soja desconhecido: ${profileId}`);
  return profile;
}

export function compareSoybeanMoProfiles() {
  return {
    profiles: [SOYBEAN_MO_PROFILES.RS_SC_2025, SOYBEAN_MO_PROFILES.EMBRAPA_BR_2020],
    conflictDimensions: SOYBEAN_MO_CONFLICT_DIMENSIONS,
    autoSelectionAllowed: false as const,
    automaticDoseAllowed: false as const,
    reason: "As fontes divergem em faixa foliar, estádio, frequência e enquadramento; selecionar uma fonte não equivale a homologar uma dose automática.",
  };
}

/**
 * Monta um pacote de revisão profissional. Mesmo com contexto completo, esta função NÃO prescreve dose.
 * Ela expõe a faixa da fonte selecionada, os sinais de contexto e bloqueios de segurança.
 */
export function buildSoybeanMolybdenumReviewPacket(input: {
  profileId: SoybeanMoProfileId;
  region: SoybeanMoRegion;
  applicationMethod: SoybeanMoApplicationMethod;
  soilPhWater: number | null;
  earlyNitrogenDeficiencyObserved: boolean | null;
  soilTexture: SoybeanSoilTexture;
  integratedCropLivestock: boolean;
  pastureMoDryMatterMgPerKg: number | null;
}) {
  validateOptionalPh(input.soilPhWater);
  validateOptionalNonNegative(input.pastureMoDryMatterMgPerKg, "Mo na matéria seca da pastagem");

  const profile = getSoybeanMoProfile(input.profileId);
  const trace = buildRuleTrace(profile.ruleId);
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (profile.geographicScope === "RS_SC" && input.region === "OTHER_BRAZIL") {
    blockers.push("REGIONAL_PROFILE_OUTSIDE_RS_SC");
  }

  if (profile.profileId === "RS_SC_2025" && input.integratedCropLivestock) {
    if (input.pastureMoDryMatterMgPerKg === null) {
      blockers.push("PASTURE_MO_MONITORING_REQUIRED");
    } else if (input.pastureMoDryMatterMgPerKg >= (profile.pastureStopThresholdMgPerKg ?? Infinity)) {
      blockers.push("PASTURE_MO_THRESHOLD_REACHED");
    }
    warnings.push("A fonte regional alerta para acúmulo de Mo em pastagens, interferência no metabolismo de Cu em ruminantes e não recomenda aplicação anual em ILP.");
  }

  const responseContextMatched = input.soilPhWater === null || input.earlyNitrogenDeficiencyObserved === null
    ? null
    : input.soilPhWater < 5.5 && input.earlyNitrogenDeficiencyObserved;

  if (profile.profileId === "RS_SC_2025" && responseContextMatched === false) {
    warnings.push("O contexto de maior probabilidade de resposta descrito pela fonte regional (pHágua <5,5 + deficiência inicial de N) não foi integralmente observado.");
  }

  if (input.soilTexture === "SANDY") {
    warnings.push("A fonte regional associa as doses maiores da faixa a solos arenosos; a RAIZ não escolhe automaticamente o extremo superior.");
  }

  const sourceRange = input.applicationMethod === "SEED" ? profile.seedRange : profile.foliarRange;

  return {
    profileId: profile.profileId,
    ruleId: trace.ruleId,
    ruleVersion: trace.ruleVersion,
    executionStatus: trace.executionStatus,
    sourceTitle: profile.sourceTitle,
    sourceYear: profile.sourceYear,
    sourceLocator: profile.sourceLocator,
    sourceUrl: profile.sourceUrl,
    applicationMethod: input.applicationMethod,
    sourceRangeGMoPerHa: { ...sourceRange },
    foliarStage: profile.foliarStage,
    preferredMethod: profile.preferredMethod,
    triggerFraming: profile.triggerFraming,
    annualUsePolicy: profile.annualUsePolicy,
    responseContextMatched,
    sandySoilHighEndSignal: input.soilTexture === "SANDY",
    blockers,
    warnings,
    applicationBlockedBySafety: blockers.includes("PASTURE_MO_THRESHOLD_REACHED") || blockers.includes("REGIONAL_PROFILE_OUTSIDE_RS_SC"),
    professionalReviewRequired: true as const,
    autoProfileSelectionAllowed: false as const,
    automaticDoseGMoPerHa: null,
    canAutoPrescribe: false as const,
  };
}
