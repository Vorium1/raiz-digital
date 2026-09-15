import { buildRuleTrace, evaluateAgronomicRuleAutomation } from "./agronomic-rule-catalog.ts";

export const RICE_DRY_SOIL_LIMING_PROFILE = "SOSBAI_2025_ARROZ_SEMEADURA_SOLO_SECO" as const;

export type RiceDrySoilCroppingContext =
  | "RICE_ONLY_OR_NO_HIGHER_PH_ROTATION"
  | "ROTATION_WITH_UPLAND_CROPS"
  | "UNKNOWN";

export type RiceDrySoilBufferingContext =
  | "STANDARD_SMP_APPLICABLE"
  | "LOW_BUFFERING_CONFIRMED"
  | "UNKNOWN";

export type RiceDrySoilLimingDecision =
  | "APPLY"
  | "DO_NOT_APPLY"
  | "BLOCKED_SOURCE_DOMAIN"
  | "BLOCKED_PROFESSIONAL_REVIEW";

const SOSBAI_2025_SOURCE = "SOSBAI 2025, pp.42-43, Tabelas 4.1-4.2";

const SMP_PH55_TABLE: ReadonlyArray<{ smp: number; dose: number }> = [
  { smp: 4.4, dose: 15.0 },
  { smp: 4.5, dose: 12.5 },
  { smp: 4.6, dose: 10.9 },
  { smp: 4.7, dose: 9.6 },
  { smp: 4.8, dose: 8.5 },
  { smp: 4.9, dose: 7.7 },
  { smp: 5.0, dose: 6.6 },
  { smp: 5.1, dose: 6.0 },
  { smp: 5.2, dose: 5.3 },
  { smp: 5.3, dose: 4.8 },
  { smp: 5.4, dose: 4.2 },
  { smp: 5.5, dose: 3.7 },
  { smp: 5.6, dose: 3.2 },
  { smp: 5.7, dose: 2.8 },
  { smp: 5.8, dose: 2.3 },
  { smp: 5.9, dose: 2.0 },
  { smp: 6.0, dose: 1.6 },
  { smp: 6.1, dose: 1.3 },
  { smp: 6.2, dose: 1.0 },
  { smp: 6.3, dose: 0.8 },
  { smp: 6.4, dose: 0.6 },
  { smp: 6.5, dose: 0.4 },
  { smp: 6.6, dose: 0.2 },
  { smp: 6.7, dose: 0.0 },
  { smp: 6.8, dose: 0.0 },
  { smp: 6.9, dose: 0.0 },
  { smp: 7.0, dose: 0.0 },
];

function requireReady() {
  const decision = evaluateAgronomicRuleAutomation("CALAGEM-ARROZ-SECO-SOSBAI-2025");
  if (!decision.allowed || !decision.rule) {
    throw new Error(`Regra CALAGEM-ARROZ-SECO-SOSBAI-2025 não está liberada (${decision.status}).`);
  }
  return buildRuleTrace("CALAGEM-ARROZ-SECO-SOSBAI-2025");
}

function finiteInRange(value: number, min: number, max: number, label: string) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} deve ser finito entre ${min} e ${max}.`);
  }
}

function finiteNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} deve ser finito e maior ou igual a zero.`);
  }
}

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function lookupSmpPh55(smpIndex: number) {
  if (!Number.isFinite(smpIndex)) throw new Error("Índice SMP deve ser finito.");
  if (smpIndex <= SMP_PH55_TABLE[0].smp) {
    return { doseTonHaPrnt100: SMP_PH55_TABLE[0].dose, interpolated: false };
  }
  const last = SMP_PH55_TABLE[SMP_PH55_TABLE.length - 1];
  if (smpIndex >= last.smp) {
    return { doseTonHaPrnt100: last.dose, interpolated: false };
  }
  for (let index = 0; index < SMP_PH55_TABLE.length - 1; index += 1) {
    const a = SMP_PH55_TABLE[index];
    const b = SMP_PH55_TABLE[index + 1];
    if (smpIndex < a.smp || smpIndex > b.smp) continue;
    if (smpIndex === a.smp) return { doseTonHaPrnt100: a.dose, interpolated: false };
    if (smpIndex === b.smp) return { doseTonHaPrnt100: b.dose, interpolated: false };
    const fraction = (smpIndex - a.smp) / (b.smp - a.smp);
    return {
      doseTonHaPrnt100: round(a.dose + fraction * (b.dose - a.dose)),
      interpolated: true,
    };
  }
  throw new Error("Índice SMP fora do domínio da Tabela 4.2.");
}

function baseResult(trace: ReturnType<typeof buildRuleTrace>, input: {
  croppingContext: RiceDrySoilCroppingContext;
  bufferingContext: RiceDrySoilBufferingContext;
}) {
  return {
    ruleId: trace.ruleId,
    ruleVersion: trace.ruleVersion,
    sourceSnapshotId: trace.sourceSnapshotId,
    profileId: RICE_DRY_SOIL_LIMING_PROFILE,
    establishmentSystem: "DRY_SOIL_SEEDING" as const,
    croppingContext: input.croppingContext,
    bufferingContext: input.bufferingContext,
    purpose: "ACIDITY_CORRECTION" as const,
    targetPh: 5.5 as const,
    referencePrntPct: 100 as const,
    applicationMode: "INCORPORATED" as const,
    incorporatedDepthCm: { from: 0, to: 20 } as const,
    commercialPrntAdjustmentApplied: false as const,
    source: SOSBAI_2025_SOURCE,
  };
}

/**
 * SOSBAI 2025, pp.42-43, Tabelas 4.1-4.2.
 *
 * Escopo fechado: arroz irrigado semeado em solo seco, amostra 0-20 cm,
 * sem sucessão/rotação que exija elevar o alvo para pH 6,0.
 *
 * Domínio positivo literal: pHágua <5,5, V <65% e saturação por Al >=10%.
 * Domínio negativo literal da nota (1): V >=65% e Al <10% -> não aplicar.
 * Os quadrantes mistos permanecem fail-closed como domínio não especificado;
 * a RAIZ não usa o complemento lógico da nota como autorização automática.
 *
 * Em baixo poder tampão explicitamente confirmado, a fonte recomenda a
 * equação pH 5,5: NC = -0,653 + 0,480*MO + 1,937*Al. Fora desse contexto,
 * usa-se a Tabela 4.2 por índice SMP. A função nunca escolhe silenciosamente
 * entre os dois métodos.
 */
export function evaluateRiceDrySoilLimingSosbai2025(input: {
  profileId: typeof RICE_DRY_SOIL_LIMING_PROFILE;
  establishmentSystem: "DRY_SOIL_SEEDING";
  sampleDepthCm: { from: number; to: number };
  croppingContext: RiceDrySoilCroppingContext;
  bufferingContext: RiceDrySoilBufferingContext;
  phWater0To20: number;
  baseSaturation0To20Pct: number;
  aluminumSaturation0To20Pct: number;
  smp0To20?: number | null;
  organicMatterPct?: number | null;
  exchangeableAlCmolcPerDm3?: number | null;
}) {
  const trace = requireReady();
  const common = baseResult(trace, input);

  if (input.profileId !== RICE_DRY_SOIL_LIMING_PROFILE) {
    throw new Error("Perfil incompatível com a regra de arroz irrigado semeado em solo seco.");
  }
  if (input.establishmentSystem !== "DRY_SOIL_SEEDING") {
    throw new Error("Sistema de estabelecimento incompatível: esta regra exige semeadura em solo seco.");
  }
  if (input.sampleDepthCm.from !== 0 || input.sampleDepthCm.to !== 20) {
    throw new Error("Profundidade incompatível: a regra exige amostra representativa de 0-20 cm.");
  }

  finiteInRange(input.phWater0To20, 0, 14, "pH em água 0-20 cm");
  finiteInRange(input.baseSaturation0To20Pct, 0, 100, "Saturação por bases 0-20 cm");
  finiteInRange(input.aluminumSaturation0To20Pct, 0, 100, "Saturação por Al 0-20 cm");

  if (input.croppingContext === "UNKNOWN") {
    return {
      ...common,
      decision: "BLOCKED_PROFESSIONAL_REVIEW" as const,
      automaticDoseAllowed: false as const,
      recommendedDoseTonHaPrnt100: null,
      doseMethod: null,
      interpolated: false,
      blockers: ["CROPPING_CONTEXT_REQUIRED"],
      warnings: [],
    };
  }

  if (input.croppingContext === "ROTATION_WITH_UPLAND_CROPS") {
    return {
      ...common,
      decision: "BLOCKED_PROFESSIONAL_REVIEW" as const,
      automaticDoseAllowed: false as const,
      recommendedDoseTonHaPrnt100: null,
      doseMethod: null,
      interpolated: false,
      blockers: ["ROTATION_TARGET_PH_6_REQUIRES_SEPARATE_RULE"],
      warnings: ["SOSBAI_2025_ROTATION_WITH_UPLAND_CROPS_USES_PH_6_TARGET"],
    };
  }

  if (input.phWater0To20 >= 5.5) {
    return {
      ...common,
      decision: "DO_NOT_APPLY" as const,
      automaticDoseAllowed: true as const,
      recommendedDoseTonHaPrnt100: 0,
      doseMethod: null,
      interpolated: false,
      blockers: [],
      warnings: [],
    };
  }

  const positiveDomain = input.baseSaturation0To20Pct < 65 && input.aluminumSaturation0To20Pct >= 10;
  const explicitNoApplyDomain = input.baseSaturation0To20Pct >= 65 && input.aluminumSaturation0To20Pct < 10;

  if (explicitNoApplyDomain) {
    return {
      ...common,
      decision: "DO_NOT_APPLY" as const,
      automaticDoseAllowed: true as const,
      recommendedDoseTonHaPrnt100: 0,
      doseMethod: null,
      interpolated: false,
      blockers: [],
      warnings: ["SOSBAI_2025_TABLE_4_1_EXPLICIT_V_AL_NO_APPLY_DOMAIN"],
    };
  }

  if (!positiveDomain) {
    return {
      ...common,
      decision: "BLOCKED_SOURCE_DOMAIN" as const,
      automaticDoseAllowed: false as const,
      recommendedDoseTonHaPrnt100: null,
      doseMethod: null,
      interpolated: false,
      blockers: ["V_AL_COMBINATION_NOT_EXPLICITLY_AUTHORIZED_BY_SOURCE"],
      warnings: [],
    };
  }

  if (input.bufferingContext === "UNKNOWN") {
    return {
      ...common,
      decision: "BLOCKED_PROFESSIONAL_REVIEW" as const,
      automaticDoseAllowed: false as const,
      recommendedDoseTonHaPrnt100: null,
      doseMethod: null,
      interpolated: false,
      blockers: ["BUFFERING_CONTEXT_REQUIRED_TO_SELECT_SOSBAI_DOSE_METHOD"],
      warnings: [],
    };
  }

  if (input.bufferingContext === "LOW_BUFFERING_CONFIRMED") {
    if (input.organicMatterPct == null || input.exchangeableAlCmolcPerDm3 == null) {
      return {
        ...common,
        decision: "BLOCKED_PROFESSIONAL_REVIEW" as const,
        automaticDoseAllowed: false as const,
        recommendedDoseTonHaPrnt100: null,
        doseMethod: "LOW_BUFFERING_POLYNOMIAL_PH_5_5" as const,
        interpolated: false,
        blockers: ["LOW_BUFFERING_FORMULA_REQUIRES_OM_AND_EXCHANGEABLE_AL"],
        warnings: [],
      };
    }
    finiteNonNegative(input.organicMatterPct, "Matéria orgânica");
    finiteNonNegative(input.exchangeableAlCmolcPerDm3, "Al trocável");
    const calculated = -0.653 + 0.480 * input.organicMatterPct + 1.937 * input.exchangeableAlCmolcPerDm3;
    if (calculated <= 0) {
      return {
        ...common,
        decision: "BLOCKED_PROFESSIONAL_REVIEW" as const,
        automaticDoseAllowed: false as const,
        recommendedDoseTonHaPrnt100: null,
        doseMethod: "LOW_BUFFERING_POLYNOMIAL_PH_5_5" as const,
        interpolated: false,
        blockers: ["LOW_BUFFERING_FORMULA_NON_POSITIVE_IN_POSITIVE_LIMING_DOMAIN"],
        warnings: [],
      };
    }
    return {
      ...common,
      decision: "APPLY" as const,
      automaticDoseAllowed: true as const,
      recommendedDoseTonHaPrnt100: round(calculated),
      doseMethod: "LOW_BUFFERING_POLYNOMIAL_PH_5_5" as const,
      interpolated: false,
      blockers: [],
      warnings: ["LOW_BUFFERING_METHOD_EXPLICITLY_CONFIRMED"],
    };
  }

  if (input.smp0To20 == null) {
    return {
      ...common,
      decision: "BLOCKED_PROFESSIONAL_REVIEW" as const,
      automaticDoseAllowed: false as const,
      recommendedDoseTonHaPrnt100: null,
      doseMethod: "SMP_TABLE_4_2_PH_5_5" as const,
      interpolated: false,
      blockers: ["SMP_REQUIRED_FOR_STANDARD_BUFFERING_METHOD"],
      warnings: [],
    };
  }

  const lookup = lookupSmpPh55(input.smp0To20);
  if (lookup.doseTonHaPrnt100 <= 0) {
    return {
      ...common,
      decision: "BLOCKED_PROFESSIONAL_REVIEW" as const,
      automaticDoseAllowed: false as const,
      recommendedDoseTonHaPrnt100: null,
      doseMethod: "SMP_TABLE_4_2_PH_5_5" as const,
      interpolated: lookup.interpolated,
      blockers: ["SMP_TABLE_ZERO_CONFLICTS_WITH_POSITIVE_ACIDITY_DOMAIN"],
      warnings: [],
    };
  }

  return {
    ...common,
    decision: "APPLY" as const,
    automaticDoseAllowed: true as const,
    recommendedDoseTonHaPrnt100: lookup.doseTonHaPrnt100,
    doseMethod: "SMP_TABLE_4_2_PH_5_5" as const,
    interpolated: lookup.interpolated,
    blockers: [],
    warnings: [],
  };
}
