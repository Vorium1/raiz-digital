import { buildRuleTrace, evaluateAgronomicRuleAutomation } from "./agronomic-rule-catalog.ts";

export const SOYBEAN_MO_RS_SC_2025_PROFILE = "SOJA_RS_SC_2025_MO_APOS_INDICACAO_PROFISSIONAL" as const;
export const SOYBEAN_MO_RS_SC_2025_RULE_ID = "MO-SOJA-RS-SC-2025-AFTER-PROFESSIONAL-INDICATION" as const;

export type SoybeanMoApplicationRoute = "SEED" | "FOLIAR";
export type SoybeanMoFoliarStage = "V2" | "V3" | "OTHER";
export type SoybeanMoSoilTexture = "SANDY" | "NON_SANDY" | "UNKNOWN";

export type SoybeanMoRsSc2025Input = {
  profileId: typeof SOYBEAN_MO_RS_SC_2025_PROFILE;
  professionalIndicationConfirmed: boolean;
  applicationRoute: SoybeanMoApplicationRoute | null;
  applicationRouteConfirmedByAgronomist: boolean;
  soilTexture: SoybeanMoSoilTexture;
  foliarStage?: SoybeanMoFoliarStage | null;
  integratedCropLivestock: boolean;
  pastureMoMgPerKgDryMatter?: number | null;
  moAppliedInPreviousSoybeanSeason?: boolean | null;
  phWater?: number | null;
  initialNitrogenDeficiencyObserved?: boolean | null;
};

type Decision = "RANGE_AVAILABLE" | "DO_NOT_APPLY" | "BLOCKED_PROFESSIONAL_REVIEW" | "BLOCKED_SOURCE_DOMAIN";

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function requireReadyRule() {
  const decision = evaluateAgronomicRuleAutomation(SOYBEAN_MO_RS_SC_2025_RULE_ID);
  if (!decision.allowed || !decision.rule) {
    throw new Error(`Regra ${SOYBEAN_MO_RS_SC_2025_RULE_ID} não está liberada (${decision.status}).`);
  }
  return buildRuleTrace(SOYBEAN_MO_RS_SC_2025_RULE_ID);
}

function baseResult(trace: ReturnType<typeof requireReadyRule>, input: SoybeanMoRsSc2025Input) {
  const responseContextMatch = finite(input.phWater) && typeof input.initialNitrogenDeficiencyObserved === "boolean"
    ? input.phWater < 5.5 && input.initialNitrogenDeficiencyObserved
    : null;

  return {
    ruleId: trace.ruleId,
    ruleVersion: trace.ruleVersion,
    sourceSnapshotId: trace.sourceSnapshotId,
    profileId: SOYBEAN_MO_RS_SC_2025_PROFILE,
    applicationRoute: input.applicationRoute,
    professionalIndicationConfirmed: input.professionalIndicationConfirmed,
    sourceResponseContextMatch: responseContextMatch,
    exactDoseSelected: false as const,
    productMassConversionAllowedHere: false as const,
    automaticIndicationAllowed: false as const,
    source: {
      title: "Indicações técnicas para a cultura da soja no Rio Grande do Sul e em Santa Catarina, safras 2025/2026 e 2026/2027",
      institution: "44ª Reunião de Pesquisa de Soja da Região Sul / Embrapa Trigo / UPF",
      year: 2025,
      locator: "item 2.5.4, pp.46-47",
      url: "https://www.alice.cnptia.embrapa.br/alice/bitstream/doc/1183120/1/Indicacoes2025.pdf",
    },
  };
}

function blocked(
  trace: ReturnType<typeof requireReadyRule>,
  input: SoybeanMoRsSc2025Input,
  decision: Extract<Decision, "BLOCKED_PROFESSIONAL_REVIEW" | "BLOCKED_SOURCE_DOMAIN">,
  blockers: string[],
  warnings: string[] = [],
) {
  return {
    ...baseResult(trace, input),
    decision,
    automaticRangeAllowed: false,
    doseRangeGMoPerHa: null,
    foliarStage: input.foliarStage ?? null,
    preferredRouteBySource: "FOLIAR" as const,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
  };
}

function noApply(
  trace: ReturnType<typeof requireReadyRule>,
  input: SoybeanMoRsSc2025Input,
  reason: string,
  warnings: string[] = [],
) {
  return {
    ...baseResult(trace, input),
    decision: "DO_NOT_APPLY" as Decision,
    automaticRangeAllowed: true,
    doseRangeGMoPerHa: { min: 0, max: 0 },
    foliarStage: input.foliarStage ?? null,
    preferredRouteBySource: "FOLIAR" as const,
    blockers: [] as string[],
    warnings: [...new Set(warnings)],
    reason,
  };
}

/**
 * SOSBAI/RPSRS 2025, item 2.5.4 (pp.46-47).
 *
 * Esta função NÃO decide se Mo deve ser indicado. A própria publicação usa
 * linguagem de possibilidade de resposta e descreve situações mais prováveis,
 * não um critério diagnóstico necessário e suficiente. A indicação e a escolha
 * da via devem chegar explicitamente confirmadas pelo profissional responsável.
 *
 * Depois desses gates, o runtime apenas preserva a faixa literal da fonte:
 * - semente: 12-25 g Mo/ha;
 * - foliar: 25-50 g Mo/ha, em V2-V3;
 * - doses maiores são indicadas em solos arenosos, mas a fonte não fornece um
 *   limiar granulométrico nem autoriza escolher automaticamente um ponto da faixa.
 *
 * Em integração lavoura-pecuária, a publicação manda monitorar Mo na pastagem,
 * não aplicar todos os anos e interromper quando a matéria seca atingir 5 mg/kg.
 * Esses gates ficam fail-closed quando o histórico/monitoramento não é conhecido.
 */
export function computeSoybeanMolybdenumRsSc2025(input: SoybeanMoRsSc2025Input) {
  const trace = requireReadyRule();

  if (input.profileId !== SOYBEAN_MO_RS_SC_2025_PROFILE) {
    throw new Error("Perfil incompatível com a sub-regra regional de Mo da soja 2025.");
  }
  if (finite(input.phWater) && (input.phWater < 0 || input.phWater > 14)) {
    throw new Error("pH em água deve estar entre 0 e 14 quando informado.");
  }
  if (finite(input.pastureMoMgPerKgDryMatter) && input.pastureMoMgPerKgDryMatter < 0) {
    throw new Error("Teor de Mo na matéria seca da pastagem não pode ser negativo.");
  }

  if (!input.professionalIndicationConfirmed) {
    return blocked(trace, input, "BLOCKED_PROFESSIONAL_REVIEW", ["MO_INDICATION_REQUIRES_AGRONOMIST_CONFIRMATION"]);
  }
  if (!input.applicationRoute || !input.applicationRouteConfirmedByAgronomist) {
    return blocked(trace, input, "BLOCKED_PROFESSIONAL_REVIEW", ["APPLICATION_ROUTE_REQUIRES_AGRONOMIST_SELECTION"]);
  }

  if (input.integratedCropLivestock) {
    if (typeof input.moAppliedInPreviousSoybeanSeason !== "boolean") {
      return blocked(trace, input, "BLOCKED_PROFESSIONAL_REVIEW", ["ILP_PREVIOUS_MO_APPLICATION_HISTORY_REQUIRED"]);
    }
    if (input.moAppliedInPreviousSoybeanSeason) {
      return noApply(
        trace,
        input,
        "Em integração lavoura-pecuária, a fonte orienta não aplicar Mo na soja todos os anos.",
        ["ILP_AVOID_CONSECUTIVE_ANNUAL_MO_APPLICATION"],
      );
    }
    if (!finite(input.pastureMoMgPerKgDryMatter)) {
      return blocked(trace, input, "BLOCKED_PROFESSIONAL_REVIEW", ["ILP_PASTURE_MO_MONITORING_REQUIRED"]);
    }
    if (input.pastureMoMgPerKgDryMatter >= 5) {
      return noApply(
        trace,
        input,
        "Teor de Mo na matéria seca da pastagem atingiu o limite de 5 mg/kg explicitado pela fonte.",
        ["ILP_PASTURE_MO_AT_OR_ABOVE_5_MG_KG_STOP_APPLICATION"],
      );
    }
  }

  if (input.applicationRoute === "FOLIAR") {
    if (input.foliarStage !== "V2" && input.foliarStage !== "V3") {
      return blocked(trace, input, "BLOCKED_SOURCE_DOMAIN", ["FOLIAR_APPLICATION_REQUIRES_V2_OR_V3"]);
    }
    return {
      ...baseResult(trace, input),
      decision: "RANGE_AVAILABLE" as Decision,
      automaticRangeAllowed: true,
      doseRangeGMoPerHa: { min: 25, max: 50 },
      foliarStage: input.foliarStage,
      preferredRouteBySource: "FOLIAR" as const,
      blockers: [] as string[],
      warnings: input.soilTexture === "SANDY"
        ? ["SOURCE_INDICATES_HIGHER_DOSES_FOR_SANDY_SOILS_EXACT_POINT_REQUIRES_PROFESSIONAL_SELECTION"]
        : [],
      timing: "V2_V3_APPROX_30_TO_45_DAYS_AFTER_EMERGENCE" as const,
      inoculationCompatibilityNote: "FOLIAR_PREFERRED_TO_REDUCE_RISK_TO_SEED_INOCULATED_N_FIXING_BACTERIA" as const,
    };
  }

  return {
    ...baseResult(trace, input),
    decision: "RANGE_AVAILABLE" as Decision,
    automaticRangeAllowed: true,
    doseRangeGMoPerHa: { min: 12, max: 25 },
    foliarStage: null,
    preferredRouteBySource: "FOLIAR" as const,
    blockers: [] as string[],
    warnings: [
      "SEED_APPLICATION_MUST_PRECEDE_INOCULATION",
      "SEED_ROUTE_MAY_HARM_SURVIVAL_OF_N_FIXING_BACTERIA",
      ...(input.soilTexture === "SANDY"
        ? ["SOURCE_INDICATES_HIGHER_DOSES_FOR_SANDY_SOILS_EXACT_POINT_REQUIRES_PROFESSIONAL_SELECTION"]
        : []),
    ],
    timing: "BEFORE_INOCULATION" as const,
    inoculationCompatibilityNote: "SOURCE_PREFERS_FOLIAR_TO_REDUCE_RISK_TO_INOCULATED_BACTERIA" as const,
  };
}
