export type BiologicalFunctionalRole =
  | "BIOLOGICAL_N_FIXATION"
  | "PLANT_GROWTH_PROMOTION"
  | "PHOSPHORUS_SOLUBILIZATION"
  | "POTASSIUM_SOLUBILIZATION"
  | "MYCORRHIZAL_NUTRIENT_UPTAKE"
  | "DISEASE_SUPPRESSION"
  | "OTHER";

export type BiologicalEvidenceKind =
  | "SOIL_OR_ROOT_DETECTION"
  | "FUNCTIONAL_LAB_ASSAY"
  | "INOCULANT_PRODUCT_QUALITY"
  | "FIELD_APPLICATION_RECORD"
  | "CROP_SPECIFIC_AGRONOMIC_VALIDATION";

export type BiologicalFunctionalEvidenceItem = {
  kind: BiologicalEvidenceKind;
  functionalRole: BiologicalFunctionalRole;
  organismOrConsortium?: string | null;
  cropCode?: string | null;
  sourceTitle?: string | null;
  methodOrProtocol?: string | null;
  productRegistrationId?: string | null;
  applicationDate?: string | null;
  validatedAgronomicRuleId?: string | null;
};

export type BiologicalFunctionalEvidenceStage =
  | "NO_EVIDENCE"
  | "DETECTED_ONLY"
  | "FUNCTION_DEMONSTRATED_IN_LAB"
  | "REGISTERED_OR_QUALITY_CONTROLLED_PRODUCT"
  | "APPLICATION_DOCUMENTED"
  | "CROP_SPECIFIC_VALIDATION_PRESENT";

function normalizeOptional(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function validDate(value: string | null | undefined) {
  if (!value?.trim()) return true;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

function sameRole(
  items: BiologicalFunctionalEvidenceItem[],
  role: BiologicalFunctionalRole,
) {
  return items.filter((item) => item.functionalRole === role);
}

/**
 * Constrói a cadeia de evidência de um grupo funcional/bioinsumo sem converter
 * presença, abundância, registro de produto ou ensaio in vitro em dose de nutriente.
 *
 * Invariantes:
 * - organismo detectado no solo != inoculação documentada;
 * - produto registrado/controle de qualidade != colonização/atividade no talhão;
 * - atividade funcional in vitro != fluxo de N/P/K em campo;
 * - aplicação documentada != resposta agronômica garantida;
 * - somente uma regra agronômica específica e validada pode futuramente abrir
 *   um cálculo determinístico de ajuste, fora deste módulo.
 */
export function evaluateBiologicalFunctionalEvidence(input: {
  role: BiologicalFunctionalRole;
  cropCode?: string | null;
  evidence: BiologicalFunctionalEvidenceItem[];
}) {
  const cropCode = normalizeOptional(input.cropCode)?.toUpperCase() ?? null;
  const relevant = sameRole(input.evidence, input.role);

  for (const item of relevant) {
    if (item.applicationDate && !validDate(item.applicationDate)) {
      throw new Error("BIOLOGICAL_APPLICATION_DATE_INVALID");
    }
    if (
      item.kind === "CROP_SPECIFIC_AGRONOMIC_VALIDATION"
      && !normalizeOptional(item.validatedAgronomicRuleId)
    ) {
      throw new Error("BIOLOGICAL_VALIDATION_RULE_ID_REQUIRED");
    }
  }

  const detections = relevant.filter((item) => item.kind === "SOIL_OR_ROOT_DETECTION");
  const functionalAssays = relevant.filter((item) => item.kind === "FUNCTIONAL_LAB_ASSAY");
  const productQuality = relevant.filter((item) => item.kind === "INOCULANT_PRODUCT_QUALITY");
  const applications = relevant.filter((item) => item.kind === "FIELD_APPLICATION_RECORD");
  const validations = relevant.filter((item) =>
    item.kind === "CROP_SPECIFIC_AGRONOMIC_VALIDATION"
    && (!cropCode || normalizeOptional(item.cropCode)?.toUpperCase() === cropCode)
  );

  let stage: BiologicalFunctionalEvidenceStage = "NO_EVIDENCE";
  if (detections.length) stage = "DETECTED_ONLY";
  if (functionalAssays.length) stage = "FUNCTION_DEMONSTRATED_IN_LAB";
  if (productQuality.length) stage = "REGISTERED_OR_QUALITY_CONTROLLED_PRODUCT";
  if (applications.length) stage = "APPLICATION_DOCUMENTED";
  if (validations.length) stage = "CROP_SPECIFIC_VALIDATION_PRESENT";

  const warnings: string[] = [];
  if (detections.length && !applications.length) {
    warnings.push("BIOLOGICAL_DETECTION_DOES_NOT_PROVE_FIELD_INOCULATION");
  }
  if (functionalAssays.length) {
    warnings.push("BIOLOGICAL_IN_VITRO_FUNCTION_IS_NOT_FIELD_NUTRIENT_FLUX");
  }
  if (productQuality.length && !applications.length) {
    warnings.push("INOCULANT_PRODUCT_QUALITY_DOES_NOT_PROVE_FIELD_APPLICATION");
  }
  if (applications.length && !validations.length) {
    warnings.push("BIOLOGICAL_APPLICATION_HAS_NO_CROP_SPECIFIC_VALIDATED_RULE");
  }
  if (input.role === "BIOLOGICAL_N_FIXATION" && cropCode && !validations.length) {
    warnings.push("BIOLOGICAL_N_FIXATION_DOES_NOT_AUTHORIZE_GENERIC_N_CREDIT");
  }
  if (
    (input.role === "PHOSPHORUS_SOLUBILIZATION"
      || input.role === "POTASSIUM_SOLUBILIZATION"
      || input.role === "MYCORRHIZAL_NUTRIENT_UPTAKE")
    && !validations.length
  ) {
    warnings.push("BIOLOGICAL_NUTRIENT_MOBILIZATION_DOES_NOT_AUTHORIZE_FERTILIZER_REDUCTION");
  }

  return {
    role: input.role,
    cropCode,
    stage,
    evidence: relevant,
    counts: {
      detections: detections.length,
      functionalAssays: functionalAssays.length,
      productQuality: productQuality.length,
      applications: applications.length,
      cropSpecificValidations: validations.length,
    },
    policy: {
      soilDetectionIsInoculationProof: false as const,
      productRegistrationIsFieldColonizationProof: false as const,
      labFunctionIsFieldFluxProof: false as const,
      applicationRecordIsAgronomicResponseProof: false as const,
      automaticNutrientCreditAllowed: false as const,
      automaticFertilizerDoseReductionAllowed: false as const,
      automaticFertilizerDoseIncreaseAllowed: false as const,
      deterministicAdjustmentRequiresSeparateValidatedRule: true as const,
    },
    warnings: [...new Set(warnings)],
  };
}

export const BIOLOGICAL_FUNCTIONAL_ROLE_NOTES: Record<
  BiologicalFunctionalRole,
  { note: string; genericNutrientCreditAllowed: false }
> = {
  BIOLOGICAL_N_FIXATION: {
    note: "Fixadores simbióticos, associativos ou de vida livre precisam ser interpretados por cultura, organismo/estirpe, via e regra agronômica. Presença no solo não equivale a kg N/ha.",
    genericNutrientCreditAllowed: false,
  },
  PLANT_GROWTH_PROMOTION: {
    note: "Promoção de crescimento pode envolver múltiplos mecanismos e não deve ser convertida em nutriente sem regra específica.",
    genericNutrientCreditAllowed: false,
  },
  PHOSPHORUS_SOLUBILIZATION: {
    note: "Capacidade de solubilização depende de organismo, substrato/fonte de P, meio e ambiente; não equivale automaticamente a P disponível ou redução de P2O5.",
    genericNutrientCreditAllowed: false,
  },
  POTASSIUM_SOLUBILIZATION: {
    note: "Biossolubilização de K depende do mineral, organismo e condições; não autoriza redução genérica de K2O.",
    genericNutrientCreditAllowed: false,
  },
  MYCORRHIZAL_NUTRIENT_UPTAKE: {
    note: "Esporos, colonização e função micorrízica são evidências distintas. Nenhuma delas isoladamente define crédito de P ou K.",
    genericNutrientCreditAllowed: false,
  },
  DISEASE_SUPPRESSION: {
    note: "Potencial de supressão precisa de patossistema e validação específica; atividade microbiana geral não equivale a controle de doença.",
    genericNutrientCreditAllowed: false,
  },
  OTHER: {
    note: "Função biológica não catalogada deve permanecer descritiva até existir regra específica validada.",
    genericNutrientCreditAllowed: false,
  },
};
