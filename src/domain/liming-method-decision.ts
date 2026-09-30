import { LIMING_METHOD_IDS, type Integrated020LimingLayerRequirement, type LimingMethodSelection } from "./liming-method-selector.ts";
import { normalizeManagementSystem } from "./management-system.ts";
import type {
  SoybeanLimingLabResult,
  SoybeanLimingSampleDecision,
  SoybeanLimingUniformDecision,
} from "./soybean-liming-evidence.ts";

function regionFromState(state: string | null | undefined): "RS" | "SC" | "OTHER" {
  const normalized = (state ?? "").trim().toUpperCase();
  if (normalized === "RS") return "RS";
  if (normalized === "SC") return "SC";
  return "OTHER";
}

function phAt020(results: SoybeanLimingLabResult[], sampleCode: string) {
  const rows = results.filter((row) =>
    row.sampleCode === sampleCode
    && row.parameterCode.trim().toUpperCase() === "PH"
    && row.depthFromCm === 0
    && row.depthToCm === 20
    && Number.isFinite(row.value)
    && row.value >= 0
    && row.value <= 14
  );
  if (rows.length === 0) return null;
  const first = rows[0].value;
  return rows.every((row) => Math.abs(row.value - first) <= 1e-9) ? first : null;
}

/**
 * Resolve qual decisão de calagem deve seguir para a prescrição.
 *
 * Quando o laudo é uma amostra integrada 0–20 e o seletor escolheu
 * explicitamente o método clássico CQFS-RS/SC 2016, a necessidade calculada
 * para ESSA camada pode virar a decisão quantitativa do método selecionado.
 *
 * Isto não finge conhecer 0–10/10–20 e não inventa modo superficial/incorporado.
 * A profundidade, o pH-alvo, o método e a ausência de modo de aplicação ficam
 * explícitos no snapshot.
 */
export function resolveSelectedLimingDecision(input: {
  cropCode: string | null;
  state: string | null;
  managementSystem: string | null;
  results: SoybeanLimingLabResult[];
  methodSelection: LimingMethodSelection;
  integrated020Requirement: Integrated020LimingLayerRequirement | null;
  modernDecision: SoybeanLimingUniformDecision;
}): SoybeanLimingUniformDecision {
  const requirement = input.integrated020Requirement;
  const canUseIntegrated020 =
    input.cropCode === "SOJA"
    && regionFromState(input.state) !== "OTHER"
    && input.methodSelection.selectedMethodId === LIMING_METHOD_IDS.cqfsRsSc2016Integrated020
    && input.methodSelection.samplingProfile === "INTEGRATED_0_20"
    && requirement
    && requirement.status !== "BLOCKED"
    && requirement.sampleRequirements.length > 0;

  if (!canUseIntegrated020 || !requirement) return input.modernDecision;

  const warning = "CLASSIC_INTEGRATED_0_20_METHOD_SELECTED_FROM_LAB_DEPTH";
  const applicationWarning = "APPLICATION_MODE_NOT_INFERRED_FROM_INTEGRATED_0_20_SAMPLE";
  const sampleDecisions: SoybeanLimingSampleDecision[] = requirement.sampleRequirements.map((item) => ({
    sampleCode: item.sampleCode,
    depthFromCm: 0,
    depthToCm: 20,
    decision: item.doseTonHaPrnt100 > 0 ? "APPLY" : "DO_NOT_APPLY",
    automaticDoseAllowed: true,
    recommendedDoseTonHaPrnt100: item.doseTonHaPrnt100,
    applicationMode: null,
    incorporatedDepthCm: null,
    phWater: phAt020(input.results, item.sampleCode),
    smp: item.smpIndex,
    baseSaturationPct: null,
    aluminumSaturationPct: null,
    derivedBaseSaturation: false,
    derivedAluminumSaturation: false,
    ruleId: requirement.methodId,
    blockers: [],
    warnings: [warning, applicationWarning],
  }));

  const allZero = sampleDecisions.every((item) => (item.recommendedDoseTonHaPrnt100 ?? 0) <= 0);
  const uniformDose = requirement.uniformDoseTonHaPrnt100;
  const operationalDose = requirement.operationalGeneralDoseTonHaPrnt100;

  if (allZero) {
    return {
      cropCode: input.cropCode,
      region: regionFromState(input.state),
      managementSystem: normalizeManagementSystem(input.managementSystem),
      status: "UNIFORM_NO_APPLY",
      automaticUniformDoseAllowed: true,
      uniformDoseTonHaPrnt100: 0,
      automaticGeneralDoseAllowed: true,
      operationalGeneralDoseTonHaPrnt100: 0,
      generalDoseBasis: "UNIFORM",
      doseRangeTonHaPrnt100: { min: 0, max: 0 },
      applicationMode: null,
      incorporatedDepthCm: null,
      sampleDecisions,
      blockers: [],
      warnings: [warning, applicationWarning],
    };
  }

  if (requirement.status === "UNIFORM" && uniformDose != null && uniformDose > 0) {
    return {
      cropCode: input.cropCode,
      region: regionFromState(input.state),
      managementSystem: normalizeManagementSystem(input.managementSystem),
      status: "UNIFORM_APPLY",
      automaticUniformDoseAllowed: true,
      uniformDoseTonHaPrnt100: uniformDose,
      automaticGeneralDoseAllowed: true,
      operationalGeneralDoseTonHaPrnt100: uniformDose,
      generalDoseBasis: "UNIFORM",
      doseRangeTonHaPrnt100: requirement.doseRangeTonHaPrnt100,
      applicationMode: null,
      incorporatedDepthCm: null,
      sampleDecisions,
      blockers: [],
      warnings: [warning, applicationWarning],
    };
  }

  return {
    cropCode: input.cropCode,
    region: regionFromState(input.state),
    managementSystem: normalizeManagementSystem(input.managementSystem),
    status: "SPATIAL",
    automaticUniformDoseAllowed: false,
    uniformDoseTonHaPrnt100: null,
    automaticGeneralDoseAllowed: operationalDose != null && operationalDose > 0,
    operationalGeneralDoseTonHaPrnt100: operationalDose,
    generalDoseBasis: operationalDose != null && operationalDose > 0
      ? requirement.generalDoseBasis
      : null,
    doseRangeTonHaPrnt100: requirement.doseRangeTonHaPrnt100,
    applicationMode: null,
    incorporatedDepthCm: null,
    sampleDecisions,
    blockers: operationalDose == null
      ? ["LIMING_EQUAL_WEIGHT_AVERAGE_REQUIRES_EQUAL_AREA_GRID"]
      : [],
    warnings: [warning, applicationWarning],
  };
}
