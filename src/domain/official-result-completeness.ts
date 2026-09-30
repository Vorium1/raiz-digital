export type OfficialResultCompletenessBlocker = {
  code: string;
  category: "CONTRACT" | "NUTRIENT" | "LIMING" | "MICRONUTRIENT" | "APPLICATION";
  message: string;
};

export type OfficialResultCompleteness = {
  ready: boolean;
  blockers: OfficialResultCompletenessBlocker[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function prescriptionFromResponse(value: unknown) {
  const response = asRecord(value);
  return asRecord(response?.prescription);
}

function pushUnique(list: OfficialResultCompletenessBlocker[], blocker: OfficialResultCompletenessBlocker) {
  if (!list.some((item) => item.code === blocker.code && item.message === blocker.message)) list.push(blocker);
}

function nutrientLabel(code: string) {
  if (code === "P2O5") return "Fósforo";
  if (code === "K2O") return "Potássio";
  if (code === "S") return "Enxofre";
  return code;
}

function limingMessage(blockers: string[]) {
  if (blockers.includes("NO_TILL_CONSOLIDATED_10_20_CONDITION_REQUIRED")) {
    return "Calagem: classifique a condição real de 10–20 cm como com ou sem restrições antes de gerar o laudo final.";
  }
  if (blockers.some((code) => [
    "RESTRICTION_ASSESSMENT_10_20_MISSING",
    "YIELD_RESTRICTION_10_20_NOT_ASSESSED",
    "COMPACTION_RESTRICTION_10_20_NOT_ASSESSED",
    "PHOSPHORUS_RESTRICTION_10_20_NOT_ASSESSED",
    "INCORPORATION_DECISION_NOT_ASSESSED",
  ].includes(code))) {
    return "Calagem: complete a avaliação estruturada de 10–20 cm antes da publicação oficial.";
  }
  if (blockers.includes("INCORPORATION_DECISION_REQUIRES_AGRONOMIST_CONFIRMATION")) {
    return "Calagem: a decisão de incorporação precisa de confirmação profissional explícita antes da publicação oficial.";
  }
  if (blockers.includes("MANAGEMENT_SYSTEM_REQUIRED_FOR_LIMING")) {
    return "Calagem: informe o sistema de manejo do solo antes de gerar o laudo final.";
  }
  if (blockers.includes("LIMING_MANAGEMENT_CONTEXT_INVALID")) {
    return "Calagem: corrija o contexto de histórico/restrições antes da publicação oficial.";
  }
  return "Calagem: a evidência atual ainda não fecha uma decisão oficial de aplicar ou não aplicar calcário.";
}

export function hasCurrentOfficialResultContract(responsePayload: unknown) {
  const prescription = prescriptionFromResponse(responsePayload);
  if (!prescription) return false;
  return Object.prototype.hasOwnProperty.call(prescription, "limingDecision")
    && Boolean(asRecord(prescription.limingMethodSelection))
    && Boolean(asRecord(prescription.spatialNutrientPlan))
    && Array.isArray(prescription.soilComplementActions);
}

export function evaluateOfficialResultCompleteness(responsePayload: unknown): OfficialResultCompleteness {
  const blockers: OfficialResultCompletenessBlocker[] = [];
  const prescription = prescriptionFromResponse(responsePayload);

  if (!prescription) {
    return {
      ready: false,
      blockers: [{ code: "PRESCRIPTION_PAYLOAD_MISSING", category: "CONTRACT", message: "A conclusão técnica precisa ser regenerada no contrato atual antes da publicação." }],
    };
  }

  if (!hasCurrentOfficialResultContract(responsePayload)) {
    pushUnique(blockers, {
      code: "OFFICIAL_RESULT_CONTRACT_REFRESH_REQUIRED",
      category: "CONTRACT",
      message: "Atualize a conclusão técnica para o contrato atual antes de gerar o laudo final.",
    });
  }

  const recommendations = Array.isArray(prescription.recommendations) ? prescription.recommendations : [];
  const hasExplicitRecommendation = (parameterCode: string) => recommendations.some((raw) => {
    const recommendation = asRecord(raw);
    const inputType = typeof recommendation?.inputType === "string" ? recommendation.inputType.trim().toUpperCase() : "";
    const quantity = typeof recommendation?.quantity === "number" ? recommendation.quantity : Number.NaN;
    const unit = typeof recommendation?.unit === "string" ? recommendation.unit.trim() : "";
    return inputType === parameterCode.trim().toUpperCase() && Number.isFinite(quantity) && quantity > 0 && Boolean(unit);
  });

  const spatialPlan = asRecord(prescription.spatialNutrientPlan);
  const nutrients = Array.isArray(spatialPlan?.nutrients) ? spatialPlan!.nutrients : [];
  for (const raw of nutrients) {
    const item = asRecord(raw);
    const nutrient = typeof item?.nutrient === "string" ? item.nutrient : "";
    const status = typeof item?.status === "string" ? item.status : "";
    if (status !== "BLOCKED" || !new Set(["P2O5", "K2O", "S"]).has(nutrient)) continue;
    pushUnique(blockers, {
      code: nutrient + "_DECISION_BLOCKED",
      category: "NUTRIENT",
      message: nutrientLabel(nutrient) + ": a evidência atual não sustenta dose uniforme nem decisão por ponto/zona. Complete os dados exigidos pela regra antes de publicar.",
    });
  }

  const liming = asRecord(prescription.limingDecision);
  if (!liming) {
    pushUnique(blockers, {
      code: "LIMING_DECISION_MISSING",
      category: "LIMING",
      message: "Calagem: a decisão oficial precisa indicar aplicar, aplicação espacial ou não aplicar antes de gerar o laudo final.",
    });
  } else if (liming.status === "BLOCKED") {
    const codes = Array.isArray(liming.blockers) ? liming.blockers.filter((item): item is string => typeof item === "string") : [];
    const layerRequirement = asRecord(prescription.limingLayerRequirement);
    const methodSelection = asRecord(prescription.limingMethodSelection);
    const hasIntegrated020Reference =
      methodSelection?.samplingProfile === "INTEGRATED_0_20"
      && layerRequirement
      && layerRequirement.status !== "BLOCKED";
    pushUnique(blockers, {
      code: hasIntegrated020Reference ? "LIMING_APPLICATION_METHOD_NOT_CLOSED" : "LIMING_DECISION_BLOCKED",
      category: "LIMING",
      message: hasIntegrated020Reference
        ? "Calagem: o laudo 0–20 já sustenta cálculo SMP da camada, mas o método de aplicação escolhido para esta condição ainda precisa estar fechado antes da emissão oficial."
        : limingMessage(codes),
    });
  } else if (!Object.prototype.hasOwnProperty.call(prescription, "limingDecision")) {
    const missing = Array.isArray(prescription.missingInformation)
      ? prescription.missingInformation.filter((item): item is string => typeof item === "string")
      : [];
    const limeMissing = missing.find((item) => /^calagem\b/i.test(item.trim()));
    if (limeMissing) {
      pushUnique(blockers, {
        code: "LIMING_LEGACY_BLOCKED",
        category: "LIMING",
        message: limeMissing,
      });
    }
  }

  const complements = Array.isArray(prescription.soilComplementActions) ? prescription.soilComplementActions : [];
  for (const raw of complements) {
    const item = asRecord(raw);
    const status = typeof item?.status === "string" ? item.status : "";
    if (!new Set(["LOW_REQUIRES_COMPLEMENT_REVIEW", "HETEROGENEOUS_REQUIRES_COMPLEMENT_REVIEW"]).has(status)) continue;
    const parameterCode = typeof item?.parameterCode === "string" ? item.parameterCode : "";
    if (parameterCode && hasExplicitRecommendation(parameterCode)) continue;
    const parameter = typeof item?.label === "string" ? item.label : parameterCode || "Micronutriente";
    const action = typeof item?.action === "string" ? item.action : "Defina a correção profissional antes da publicação.";
    pushUnique(blockers, {
      code: "SOIL_COMPLEMENT_" + String(item?.parameterCode ?? "UNKNOWN"),
      category: "MICRONUTRIENT",
      message: parameter + ": " + action,
    });
  }

  const application = asRecord(prescription.applicationGuidance);
  if (application?.status === "PLACEMENT_REVIEW_REQUIRED") {
    pushUnique(blockers, {
      code: "APPLICATION_PLACEMENT_REVIEW_REQUIRED",
      category: "APPLICATION",
      message: typeof application.guidance === "string"
        ? application.guidance
        : "A orientação de aplicação/posicionamento precisa ser resolvida antes da publicação oficial.",
    });
  }

  return { ready: blockers.length === 0, blockers };
}

export function officialResultCompletenessReason(result: OfficialResultCompleteness) {
  if (result.ready) return null;
  return "Laudo final ainda não pode ser publicado: " + result.blockers.map((item) => item.message).join(" ");
}
