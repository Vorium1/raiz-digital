export type AgronomicInputClass =
  | "MINERAL_FERTILIZER"
  | "ORGANIC_FERTILIZER"
  | "ORGANOMINERAL_FERTILIZER"
  | "INOCULANT"
  | "BIOFERTILIZER"
  | "BIOSTIMULANT"
  | "REMINERALIZER"
  | "SOIL_CONDITIONER"
  | "CORRECTIVE"
  | "OTHER";

export type AgronomicInputMechanism =
  | "DIRECT_NUTRIENT_SUPPLY"
  | "SLOW_OR_CONTROLLED_RELEASE"
  | "ORGANIC_COMPLEXATION"
  | "BIOLOGICAL_N_FIXATION"
  | "PHOSPHORUS_SOLUBILIZATION"
  | "POTASSIUM_SOLUBILIZATION"
  | "MYCORRHIZAL_UPTAKE"
  | "ROOT_GROWTH_PROMOTION"
  | "MICROBIAL_ACTIVITY_SUPPORT"
  | "SOIL_CONDITIONING"
  | "PH_CORRECTION"
  | "OTHER";

export type AgronomicEvidenceKind =
  | "MAPA_REGISTRATION"
  | "PRODUCT_LABEL_OR_GUARANTEE"
  | "OFFICIAL_EFFICACY_PROTOCOL"
  | "PEER_REVIEWED_FIELD_TRIAL"
  | "MULTI_SITE_FIELD_VALIDATION"
  | "LOCAL_FIELD_VALIDATION"
  | "LAB_OR_GREENHOUSE_ONLY"
  | "MANUFACTURER_CLAIM"
  | "OTHER";

export type AgronomicInputEvidence = {
  id: string;
  kind: AgronomicEvidenceKind;
  institution: string | null;
  title: string;
  sourceUrl?: string | null;
  cropCodes?: string[];
  regionCodes?: string[];
  soilContext?: string | null;
  applicationContext?: string | null;
  resultSummary?: string | null;
};

export type QuantitativeInputEffect = {
  ruleId: string;
  cropCodes: string[];
  regionCodes: string[];
  mechanism: AgronomicInputMechanism;
  nutrient?: "N" | "P2O5" | "K2O" | "S" | "Ca" | "Mg" | "B" | "Zn" | "Cu" | "Mn" | "Mo" | null;
  effect:
    | { kind: "NUTRIENT_CREDIT_KG_HA"; kgPerHa: number }
    | { kind: "REPLACEMENT_FRACTION"; fraction: number }
    | { kind: "REQUIRED_PRODUCT_RATE_KG_HA"; rateKgPerHa: number };
  sourceEvidenceIds: string[];
  professionalApprovalRequired?: boolean;
};

export type AgronomicInputProfile = {
  code: string;
  name: string;
  inputClass: AgronomicInputClass;
  mechanisms: AgronomicInputMechanism[];
  guaranteesPercent?: Partial<Record<"N" | "P2O5" | "K2O" | "S" | "Ca" | "Mg", number>>;
  organicMatterPercent?: number | null;
  mapaRegistration?: string | null;
  evidence: AgronomicInputEvidence[];
  validatedQuantitativeEffects?: QuantitativeInputEffect[];
};

export type AgronomicInputContext = {
  cropCode: string;
  regionCode: string;
};

function norm(value: string) {
  return value.trim().toUpperCase();
}

function validPercent(value: number | null | undefined, label: string) {
  if (value == null) return;
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${label} deve ficar entre 0 e 100%.`);
  }
}

function validateProfile(profile: AgronomicInputProfile) {
  if (!profile.code.trim()) throw new Error("Código do insumo é obrigatório.");
  if (!profile.name.trim()) throw new Error("Nome do insumo é obrigatório.");
  validPercent(profile.organicMatterPercent, "Matéria orgânica");
  for (const [nutrient, value] of Object.entries(profile.guaranteesPercent ?? {})) {
    validPercent(value, `Garantia de ${nutrient}`);
  }

  for (const rule of profile.validatedQuantitativeEffects ?? []) {
    if (!rule.ruleId.trim()) throw new Error("Regra quantitativa precisa de ruleId.");
    if (!rule.sourceEvidenceIds.length) throw new Error(`Regra ${rule.ruleId} precisa de evidência de origem.`);
    if (rule.effect.kind === "REPLACEMENT_FRACTION") {
      if (!Number.isFinite(rule.effect.fraction) || rule.effect.fraction < 0 || rule.effect.fraction > 1) {
        throw new Error("Fração de substituição deve ficar entre 0 e 1.");
      }
    } else {
      const value = rule.effect.kind === "NUTRIENT_CREDIT_KG_HA"
        ? rule.effect.kgPerHa
        : rule.effect.rateKgPerHa;
      if (!Number.isFinite(value) || value < 0) throw new Error("Efeito quantitativo deve ser finito e não negativo.");
    }
  }
}

function evidenceStrength(profile: AgronomicInputProfile) {
  const kinds = new Set(profile.evidence.map((item) => item.kind));
  if (kinds.has("MULTI_SITE_FIELD_VALIDATION") && kinds.has("PEER_REVIEWED_FIELD_TRIAL")) return "STRONG" as const;
  if (
    kinds.has("MULTI_SITE_FIELD_VALIDATION")
    || kinds.has("PEER_REVIEWED_FIELD_TRIAL")
    || kinds.has("OFFICIAL_EFFICACY_PROTOCOL")
  ) return "MODERATE" as const;
  if (kinds.has("LOCAL_FIELD_VALIDATION") || kinds.has("LAB_OR_GREENHOUSE_ONLY")) return "LIMITED" as const;
  return "DECLARATIVE_ONLY" as const;
}

function applies(rule: QuantitativeInputEffect, context: AgronomicInputContext) {
  const crop = norm(context.cropCode);
  const region = norm(context.regionCode);
  return rule.cropCodes.map(norm).includes(crop) && rule.regionCodes.map(norm).includes(region);
}

/**
 * Avalia insumos por mecanismo + evidência, não por concentração NPK isolada.
 *
 * Princípios:
 * - fonte mineral, orgânica, organomineral ou biológica não recebe vantagem/desvantagem por classe;
 * - NPK declarado representa composição, não eficiência agronômica total;
 * - menor concentração pode coexistir com maior resposta agronômica em determinado contexto,
 *   mas isso só vira crédito quantitativo quando há regra específica validada;
 * - alegação comercial, registro ou presença de microrganismo isoladamente não autorizam
 *   reduzir a necessidade determinística de nutrientes.
 */
export function evaluateAgronomicInputEvidence(
  profile: AgronomicInputProfile,
  context: AgronomicInputContext,
) {
  validateProfile(profile);

  const evidenceIds = new Set(profile.evidence.map((item) => item.id));
  const applicableRules = (profile.validatedQuantitativeEffects ?? []).filter((rule) => {
    if (!applies(rule, context)) return false;
    return rule.sourceEvidenceIds.every((id) => evidenceIds.has(id));
  });

  const invalidRuleEvidenceRefs = (profile.validatedQuantitativeEffects ?? []).filter(
    (rule) => rule.sourceEvidenceIds.some((id) => !evidenceIds.has(id)),
  );

  const nutrientGuaranteeOnly = Object.keys(profile.guaranteesPercent ?? {}).length > 0
    && profile.mechanisms.every((mechanism) => mechanism === "DIRECT_NUTRIENT_SUPPLY");

  const warnings: string[] = [];
  if (invalidRuleEvidenceRefs.length) warnings.push("QUANTITATIVE_EFFECT_EVIDENCE_REFERENCE_MISSING");
  if (profile.evidence.some((item) => item.kind === "MANUFACTURER_CLAIM")) {
    warnings.push("MANUFACTURER_CLAIM_IS_NOT_INDEPENDENT_FIELD_VALIDATION");
  }
  if (profile.mechanisms.some((mechanism) =>
    ["BIOLOGICAL_N_FIXATION", "PHOSPHORUS_SOLUBILIZATION", "POTASSIUM_SOLUBILIZATION", "MYCORRHIZAL_UPTAKE"].includes(mechanism)
  ) && applicableRules.length === 0) {
    warnings.push("BIOLOGICAL_MECHANISM_DOES_NOT_CREATE_AUTOMATIC_NUTRIENT_CREDIT");
  }

  return {
    code: profile.code,
    name: profile.name,
    inputClass: profile.inputClass,
    mechanisms: [...profile.mechanisms],
    evidenceStrength: evidenceStrength(profile),
    registeredWithMapa: Boolean(profile.mapaRegistration?.trim()),
    nutrientGuaranteeOnly,
    composition: {
      guaranteesPercent: { ...(profile.guaranteesPercent ?? {}) },
      organicMatterPercent: profile.organicMatterPercent ?? null,
    },
    quantitativePolicy: {
      npkConcentrationAloneCanRankAgronomicEfficiency: false as const,
      productClassAloneCanRankAgronomicEfficiency: false as const,
      automaticNutrientCreditAllowed: applicableRules.length > 0,
      automaticDoseReplacementAllowed: applicableRules.some(
        (rule) => rule.effect.kind === "REPLACEMENT_FRACTION" || rule.effect.kind === "NUTRIENT_CREDIT_KG_HA",
      ),
      applicableRules,
    },
    comparisonPolicy: {
      compareBy: [
        "nutrient_guarantees",
        "mechanism",
        "availability_and_release",
        "soil_context",
        "crop_and_region",
        "residual_effect",
        "field_evidence",
        "operational_rate",
        "cost_per_ha",
        "cost_per_validated_response",
      ] as const,
      neutralAcrossInputClasses: true as const,
      lowerNpkCanOutperformHigherNpkWhenFieldEvidenceSupportsIt: true as const,
      higherNpkDoesNotProveHigherAgronomicEfficiency: true as const,
    },
    warnings,
  };
}
