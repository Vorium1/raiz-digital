export type SoilTextureRiskClass = "COARSE" | "MEDIUM" | "FINE" | "UNKNOWN";
export type CecRiskClass = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
export type IrrigationRegimeDetail = "NONE" | "SUPPLEMENTAL" | "FULL" | "FERTIGATION";
export type SoilWaterStatus = "DEFICIT" | "BALANCED" | "SURPLUS" | "WATERLOGGED" | "UNKNOWN";
export type DrainageStatus = "GOOD" | "MODERATE" | "POOR" | "UNKNOWN";
export type WetTrafficStatus = "NO" | "POSSIBLE" | "YES" | "UNKNOWN";
export type ResidueStatus = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";

export type SoilWaterNutrientDynamicsInput = {
  irrigationRegime: IrrigationRegimeDetail;
  soilTexture: SoilTextureRiskClass;
  cecClass: CecRiskClass;
  waterStatus: SoilWaterStatus;
  drainage: DrainageStatus;
  trafficOnWetSoil: WetTrafficStatus;
  residueLevel: ResidueStatus;
  organicMatterStatus?: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
};

export type NutrientLossRisk = {
  nutrient: "N_NO3" | "K" | "S_SO4" | "B";
  risk: "LOW" | "MODERATE" | "HIGH" | "UNKNOWN";
  mechanisms: Array<"LEACHING" | "DENITRIFICATION" | "ROOT_UPTAKE_LIMITATION">;
  splitApplicationAdvised: boolean;
  rationale: string;
};

export type SoilWaterNutrientDynamics = {
  nutrientLossRisks: NutrientLossRisk[];
  biologyState:
    | "MOISTURE_FAVORABLE"
    | "WATER_LIMITED"
    | "OXYGEN_LIMITED"
    | "MIXED_WET_CONDITIONS"
    | "UNKNOWN";
  residueDecomposition:
    | "POTENTIALLY_ACCELERATED"
    | "POTENTIALLY_SLOWED_BY_DRYNESS"
    | "ALTERED_BY_ANAEROBIOSIS"
    | "NO_DIRECTION_ASSIGNED"
    | "UNKNOWN";
  compactionRisk: "LOW" | "MODERATE" | "HIGH" | "UNKNOWN";
  rootHypoxiaRisk: "LOW" | "MODERATE" | "HIGH" | "UNKNOWN";
  oxidativeStressRisk: "LOW" | "MODERATE" | "HIGH" | "UNKNOWN";
  waterRelatedDiseasePressure: "LOW" | "MODERATE" | "ELEVATED" | "UNKNOWN";
  mediumTermMonitoring: {
    earlierSoilMonitoringAdvised: boolean;
    tissueMonitoringAdvised: boolean;
    waterBalanceMonitoringAdvised: boolean;
    drainageReviewAdvised: boolean;
  };
  automaticNutrientDoseIncreaseAllowed: false;
  warnings: string[];
};

function irrigated(regime: IrrigationRegimeDetail) {
  return regime !== "NONE";
}

function highPercolationContext(input: SoilWaterNutrientDynamicsInput) {
  return input.waterStatus === "SURPLUS" || input.waterStatus === "WATERLOGGED";
}

function coarseOrLowRetention(input: SoilWaterNutrientDynamicsInput) {
  return input.soilTexture === "COARSE" || input.cecClass === "LOW";
}

function nutrientRisk(
  input: SoilWaterNutrientDynamicsInput,
  nutrient: NutrientLossRisk["nutrient"],
): NutrientLossRisk {
  if (
    input.waterStatus === "UNKNOWN"
    || input.soilTexture === "UNKNOWN"
    || input.cecClass === "UNKNOWN"
  ) {
    return {
      nutrient,
      risk: "UNKNOWN",
      mechanisms: [],
      splitApplicationAdvised: false,
      rationale: "Faltam textura, CTC ou estado hídrico para classificar o risco sem inferência.",
    };
  }

  const excess = highPercolationContext(input);
  const lowRetention = coarseOrLowRetention(input);
  const underIrrigation = irrigated(input.irrigationRegime);

  if (nutrient === "N_NO3") {
    const mechanisms: NutrientLossRisk["mechanisms"] = [];
    if (excess || (underIrrigation && lowRetention)) mechanisms.push("LEACHING");
    if (input.waterStatus === "WATERLOGGED") {
      mechanisms.push("DENITRIFICATION", "ROOT_UPTAKE_LIMITATION");
    }

    const risk = input.waterStatus === "WATERLOGGED"
      ? "HIGH"
      : excess && lowRetention
        ? "HIGH"
        : excess || (underIrrigation && lowRetention)
          ? "MODERATE"
          : "LOW";

    return {
      nutrient,
      risk,
      mechanisms,
      splitApplicationAdvised: risk === "HIGH" || risk === "MODERATE",
      rationale: "Nitrato é altamente móvel; excesso de percolação eleva lixiviação e saturação também pode aumentar perdas gasosas por desnitrificação e limitar absorção radicular.",
    };
  }

  if (nutrient === "K") {
    const risk = excess && lowRetention
      ? "HIGH"
      : excess || (underIrrigation && lowRetention)
        ? "MODERATE"
        : "LOW";

    return {
      nutrient,
      risk,
      mechanisms: risk === "LOW" ? [] : ["LEACHING"],
      splitApplicationAdvised: risk === "HIGH" || risk === "MODERATE",
      rationale: "O K é menos móvel que o nitrato na maioria dos solos, mas perdas aumentam com maior percolação e podem ser relevantes em solo arenoso/baixa CTC ou sob lâminas excessivas.",
    };
  }

  if (nutrient === "S_SO4") {
    const risk = excess && lowRetention
      ? "HIGH"
      : excess || (underIrrigation && lowRetention)
        ? "MODERATE"
        : "LOW";
    return {
      nutrient,
      risk,
      mechanisms: risk === "LOW" ? [] : ["LEACHING"],
      splitApplicationAdvised: risk === "HIGH" || risk === "MODERATE",
      rationale: "Sulfato pode apresentar perda por lixiviação, especialmente em solos de menor retenção e sob fluxo de água elevado.",
    };
  }

  const risk = excess && lowRetention
    ? "HIGH"
    : excess || (underIrrigation && lowRetention)
      ? "MODERATE"
      : "LOW";
  return {
    nutrient,
    risk,
    mechanisms: risk === "LOW" ? [] : ["LEACHING"],
    splitApplicationAdvised: risk === "HIGH" || risk === "MODERATE",
    rationale: "Boro pode ser perdido por lixiviação em solos arenosos e sob elevado fluxo de água; o risco não autoriza aumento automático de dose.",
  };
}

function biologyState(input: SoilWaterNutrientDynamicsInput): SoilWaterNutrientDynamics["biologyState"] {
  if (input.waterStatus === "UNKNOWN") return "UNKNOWN";
  if (input.waterStatus === "DEFICIT") return "WATER_LIMITED";
  if (input.waterStatus === "WATERLOGGED") return "OXYGEN_LIMITED";
  if (input.waterStatus === "SURPLUS") return "MIXED_WET_CONDITIONS";
  return "MOISTURE_FAVORABLE";
}

function residueDecomposition(
  input: SoilWaterNutrientDynamicsInput,
): SoilWaterNutrientDynamics["residueDecomposition"] {
  if (input.waterStatus === "UNKNOWN" || input.residueLevel === "UNKNOWN") return "UNKNOWN";
  if (input.residueLevel === "LOW") return "NO_DIRECTION_ASSIGNED";
  if (input.waterStatus === "DEFICIT") return "POTENTIALLY_SLOWED_BY_DRYNESS";
  if (input.waterStatus === "WATERLOGGED") return "ALTERED_BY_ANAEROBIOSIS";
  if (input.waterStatus === "BALANCED") return "POTENTIALLY_ACCELERATED";
  return "NO_DIRECTION_ASSIGNED";
}

function compactionRisk(input: SoilWaterNutrientDynamicsInput): SoilWaterNutrientDynamics["compactionRisk"] {
  if (input.trafficOnWetSoil === "UNKNOWN") return "UNKNOWN";
  if (input.trafficOnWetSoil === "YES") return "HIGH";
  if (input.trafficOnWetSoil === "POSSIBLE") return "MODERATE";
  return "LOW";
}

function hypoxiaRisk(input: SoilWaterNutrientDynamicsInput): SoilWaterNutrientDynamics["rootHypoxiaRisk"] {
  if (input.waterStatus === "UNKNOWN" || input.drainage === "UNKNOWN") return "UNKNOWN";
  if (input.waterStatus === "WATERLOGGED") return "HIGH";
  if (input.waterStatus === "SURPLUS" && input.drainage === "POOR") return "HIGH";
  if (input.waterStatus === "SURPLUS" || input.drainage === "POOR") return "MODERATE";
  return "LOW";
}

function oxidativeRisk(input: SoilWaterNutrientDynamicsInput): SoilWaterNutrientDynamics["oxidativeStressRisk"] {
  if (input.waterStatus === "UNKNOWN") return "UNKNOWN";
  if (input.waterStatus === "DEFICIT" || input.waterStatus === "WATERLOGGED") return "HIGH";
  if (input.waterStatus === "SURPLUS") return "MODERATE";
  return "LOW";
}

function diseasePressure(input: SoilWaterNutrientDynamicsInput): SoilWaterNutrientDynamics["waterRelatedDiseasePressure"] {
  if (input.waterStatus === "UNKNOWN" || input.drainage === "UNKNOWN") return "UNKNOWN";
  if (input.waterStatus === "WATERLOGGED" || (input.waterStatus === "SURPLUS" && input.drainage === "POOR")) {
    return "ELEVATED";
  }
  if (input.waterStatus === "SURPLUS" || input.irrigationRegime === "FULL" || input.irrigationRegime === "FERTIGATION") {
    return "MODERATE";
  }
  return "LOW";
}

/**
 * Diagnóstico de dinâmica hídrica do solo para planejamento de médio/longo prazo.
 *
 * Este módulo não aumenta dose. Ele identifica quando irrigação/percolação,
 * drenagem, textura e CTC justificam:
 * - parcelamento de nutrientes mais suscetíveis a perdas;
 * - reavaliação mais frequente;
 * - monitoramento foliar/solo;
 * - revisão de drenagem e tráfego.
 *
 * "Solo úmido" e "solo encharcado" são estados distintos:
 * umidade adequada pode favorecer atividade microbiana e ciclagem; saturação
 * prolongada reduz oxigênio, limita raízes e pode aumentar doença/estresse.
 */
export function evaluateSoilWaterNutrientDynamics(
  input: SoilWaterNutrientDynamicsInput,
): SoilWaterNutrientDynamics {
  const nutrientLossRisks: NutrientLossRisk[] = [
    nutrientRisk(input, "N_NO3"),
    nutrientRisk(input, "K"),
    nutrientRisk(input, "S_SO4"),
    nutrientRisk(input, "B"),
  ];

  const biology = biologyState(input);
  const compaction = compactionRisk(input);
  const hypoxia = hypoxiaRisk(input);
  const oxidative = oxidativeRisk(input);
  const disease = diseasePressure(input);
  const highOrModerateNutrientLoss = nutrientLossRisks.some(
    (item) => item.risk === "HIGH" || item.risk === "MODERATE",
  );

  const warnings: string[] = [];
  if (input.waterStatus === "WATERLOGGED") {
    warnings.push("WATERLOGGING_IS_NOT_BIOLOGICALLY_FAVORABLE_MOISTURE");
  }
  if (compaction === "HIGH" || compaction === "MODERATE") {
    warnings.push("WET_SOIL_TRAFFIC_CAN_INCREASE_COMPACTION");
  }
  if (highOrModerateNutrientLoss) {
    warnings.push("LOSS_RISK_DOES_NOT_AUTHORIZE_AUTOMATIC_DOSE_INCREASE");
  }

  return {
    nutrientLossRisks,
    biologyState: biology,
    residueDecomposition: residueDecomposition(input),
    compactionRisk: compaction,
    rootHypoxiaRisk: hypoxia,
    oxidativeStressRisk: oxidative,
    waterRelatedDiseasePressure: disease,
    mediumTermMonitoring: {
      earlierSoilMonitoringAdvised: highOrModerateNutrientLoss || hypoxia === "HIGH",
      tissueMonitoringAdvised: highOrModerateNutrientLoss || hypoxia === "HIGH",
      waterBalanceMonitoringAdvised: irrigated(input.irrigationRegime) || input.waterStatus !== "BALANCED",
      drainageReviewAdvised: hypoxia === "HIGH" || disease === "ELEVATED",
    },
    automaticNutrientDoseIncreaseAllowed: false,
    warnings,
  };
}
