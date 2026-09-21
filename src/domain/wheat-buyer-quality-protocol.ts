export const BE8_WHEAT_VITAL_GLUTEN_PROTOCOL_2026 = {
  id: "BE8_WHEAT_VITAL_GLUTEN_2026",
  buyer: "Be8 Agro",
  crop: "TRIGO",
  campaignYear: 2026,
  industrialTarget: "VITAL_WHEAT_GLUTEN",
  source: {
    title: "Recomendação Técnica Be8 Agro — Fenologia do Trigo",
    kind: "USER_PROVIDED_DOCUMENT",
    page: 1,
    sha256: "3cd87ad061b9eb073171b5e06d118102a4346008d5b1f74604c098bfce3c910a",
  },
  legend: {
    mandatory: "Cadeado fechado / Uso Obrigatório",
    recommended: "Cadeado aberto / Uso Recomendado",
  },
  mandatory: {
    sowingBaseNitrogen: {
      minKgN: 20,
      maxKgN: 30,
      timing: "SEMEADURA",
      sourceLabel: "20 a 30 kg de N na adubação de base",
    },
    seedRate: {
      kgSeedPerHa: 160,
      timing: "SEMEADURA",
      sourceLabel: "160 kg de sementes/ha",
    },
    secondNitrogenApplication: {
      product: "AMMONIUM_SULFATE",
      formula: "(NH4)2SO4",
      minProductKgDisplayed: 150,
      maxProductKgDisplayed: 200,
      nitrogenFraction: 0.21,
      sulfurFraction: 0.24,
      sourceAreaBasis: "NOT_EXPLICIT_IN_GRAPHIC" as const,
      sourceLabel: "150 a 200 kg de (NH4)2SO4; 21% de nitrogênio e 24% de enxofre",
    },
    fungalApplication: {
      required: true,
      sourceProductSpecified: false,
      sourceDoseSpecified: false,
      sourceLabel: "Aplicação fúngica — Uso Obrigatório no período indicado no gráfico",
    },
  },
  recommended: {
    firstNitrogenApplication: {
      minKgN: 60,
      maxKgN: 90,
      mayBeSplitUntilStage: 7,
      sourceLabel: "60 a 90 kg de N podendo ser parcelada até est. 7",
    },
  },
  policy: {
    buyerProtocolIsAgronomicUniversalRule: false as const,
    requiresExplicitBuyerProtocolSelection: true as const,
    complianceGuaranteesPremium: false as const,
    missingOptionalDataBlocksBaseNitrogenRecommendation: false as const,
    recommendedItemAffectsMandatoryCompliance: false as const,
    buyerProtocolMaySilentlyOverrideAgronomicEngine: false as const,
  },
} as const;

export type Be8ProtocolCheckStatus = "COMPLIANT" | "NON_COMPLIANT" | "UNVERIFIED";

export type Be8WheatProtocolInput = {
  sowingBaseNitrogenKgN?: number | null;
  seedRateKgPerHa?: number | null;
  firstNitrogenApplicationKgN?: number | null;
  firstNitrogenLatestStage?: number | null;
  secondNitrogenApplication?: {
    product?: string | null;
    displayedAmountKg?: number | null;
  } | null;
  fungalApplicationDeclared?: boolean | null;
};

export type Be8WheatProtocolEvaluation = {
  protocolId: typeof BE8_WHEAT_VITAL_GLUTEN_PROTOCOL_2026.id;
  mandatoryCompliance: "COMPLIANT" | "NON_COMPLIANT" | "UNVERIFIED";
  premiumGuaranteed: false;
  checks: {
    sowingBaseNitrogen: Be8ProtocolCheckStatus;
    seedRate: Be8ProtocolCheckStatus;
    secondNitrogenApplication: Be8ProtocolCheckStatus;
    fungalApplication: Be8ProtocolCheckStatus;
    firstNitrogenApplicationRecommended: "FOLLOWED" | "NOT_FOLLOWED" | "UNVERIFIED";
  };
  limitations: string[];
};

function finiteNonNegative(value: number | null | undefined) {
  return value != null && Number.isFinite(value) && value >= 0;
}

function inRange(value: number, min: number, max: number) {
  return value >= min && value <= max;
}

function normalizeProduct(value: string | null | undefined) {
  if (!value?.trim()) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function isAmmoniumSulfate(value: string | null | undefined) {
  const normalized = normalizeProduct(value);
  return new Set([
    "AMMONIUMSULFATE",
    "SULFATODEAMONIO",
    "NH42SO4",
  ]).has(normalized);
}

function mandatoryOverall(statuses: Be8ProtocolCheckStatus[]): Be8WheatProtocolEvaluation["mandatoryCompliance"] {
  if (statuses.includes("NON_COMPLIANT")) return "NON_COMPLIANT";
  if (statuses.includes("UNVERIFIED")) return "UNVERIFIED";
  return "COMPLIANT";
}

/**
 * Avalia conformidade com a peça comercial fornecida da Be8.
 *
 * Importante:
 * - não substitui o motor agronômico;
 * - não transforma item recomendado em obrigatório;
 * - conformidade não significa prêmio garantido;
 * - a peça não explicita a base de área dos "150 a 200 kg" de sulfato de amônio,
 *   então o RAIZ preserva esse fato e não converte silenciosamente para kg/ha.
 */
export function evaluateBe8WheatVitalGlutenProtocol(
  input: Be8WheatProtocolInput,
): Be8WheatProtocolEvaluation {
  const p = BE8_WHEAT_VITAL_GLUTEN_PROTOCOL_2026;
  const limitations: string[] = [];

  const sowingBaseNitrogen: Be8ProtocolCheckStatus =
    input.sowingBaseNitrogenKgN == null
      ? "UNVERIFIED"
      : !finiteNonNegative(input.sowingBaseNitrogenKgN)
        ? "NON_COMPLIANT"
        : inRange(input.sowingBaseNitrogenKgN, p.mandatory.sowingBaseNitrogen.minKgN, p.mandatory.sowingBaseNitrogen.maxKgN)
          ? "COMPLIANT"
          : "NON_COMPLIANT";

  const seedRate: Be8ProtocolCheckStatus =
    input.seedRateKgPerHa == null
      ? "UNVERIFIED"
      : !finiteNonNegative(input.seedRateKgPerHa)
        ? "NON_COMPLIANT"
        : input.seedRateKgPerHa === p.mandatory.seedRate.kgSeedPerHa
          ? "COMPLIANT"
          : "NON_COMPLIANT";

  let secondNitrogenApplication: Be8ProtocolCheckStatus = "UNVERIFIED";
  if (input.secondNitrogenApplication != null) {
    const amount = input.secondNitrogenApplication.displayedAmountKg;
    if (
      !isAmmoniumSulfate(input.secondNitrogenApplication.product)
      || amount == null
      || !finiteNonNegative(amount)
    ) {
      secondNitrogenApplication = "NON_COMPLIANT";
    } else {
      secondNitrogenApplication = inRange(
        amount,
        p.mandatory.secondNitrogenApplication.minProductKgDisplayed,
        p.mandatory.secondNitrogenApplication.maxProductKgDisplayed,
      ) ? "COMPLIANT" : "NON_COMPLIANT";
    }
  }

  if (p.mandatory.secondNitrogenApplication.sourceAreaBasis === "NOT_EXPLICIT_IN_GRAPHIC") {
    limitations.push("BE8_SECOND_N_AREA_BASIS_NOT_EXPLICIT_IN_SOURCE");
  }

  const fungalApplication: Be8ProtocolCheckStatus =
    input.fungalApplicationDeclared == null
      ? "UNVERIFIED"
      : input.fungalApplicationDeclared
        ? "COMPLIANT"
        : "NON_COMPLIANT";

  let firstNitrogenApplicationRecommended: Be8WheatProtocolEvaluation["checks"]["firstNitrogenApplicationRecommended"] = "UNVERIFIED";
  if (input.firstNitrogenApplicationKgN != null || input.firstNitrogenLatestStage != null) {
    if (
      finiteNonNegative(input.firstNitrogenApplicationKgN)
      && finiteNonNegative(input.firstNitrogenLatestStage)
      && inRange(
        input.firstNitrogenApplicationKgN!,
        p.recommended.firstNitrogenApplication.minKgN,
        p.recommended.firstNitrogenApplication.maxKgN,
      )
      && input.firstNitrogenLatestStage! <= p.recommended.firstNitrogenApplication.mayBeSplitUntilStage
    ) {
      firstNitrogenApplicationRecommended = "FOLLOWED";
    } else {
      firstNitrogenApplicationRecommended = "NOT_FOLLOWED";
    }
  }

  if (p.mandatory.fungalApplication.sourceProductSpecified === false) {
    limitations.push("BE8_FUNGAL_APPLICATION_PRODUCT_NOT_SPECIFIED_IN_SOURCE");
  }
  if (p.mandatory.fungalApplication.sourceDoseSpecified === false) {
    limitations.push("BE8_FUNGAL_APPLICATION_DOSE_NOT_SPECIFIED_IN_SOURCE");
  }

  const mandatoryStatuses = [
    sowingBaseNitrogen,
    seedRate,
    secondNitrogenApplication,
    fungalApplication,
  ];

  return {
    protocolId: p.id,
    mandatoryCompliance: mandatoryOverall(mandatoryStatuses),
    premiumGuaranteed: false,
    checks: {
      sowingBaseNitrogen,
      seedRate,
      secondNitrogenApplication,
      fungalApplication,
      firstNitrogenApplicationRecommended,
    },
    limitations,
  };
}

export function ammoniumSulfateNutrientsFromProductMass(productMassKg: number) {
  if (!Number.isFinite(productMassKg) || productMassKg < 0) {
    throw new Error("Massa de sulfato de amônio inválida.");
  }
  return {
    productMassKg,
    nitrogenKg: productMassKg * BE8_WHEAT_VITAL_GLUTEN_PROTOCOL_2026.mandatory.secondNitrogenApplication.nitrogenFraction,
    sulfurKg: productMassKg * BE8_WHEAT_VITAL_GLUTEN_PROTOCOL_2026.mandatory.secondNitrogenApplication.sulfurFraction,
    areaBasis: BE8_WHEAT_VITAL_GLUTEN_PROTOCOL_2026.mandatory.secondNitrogenApplication.sourceAreaBasis,
  };
}
