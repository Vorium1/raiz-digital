import type { AgroclimateRiskDriver } from "./fertility-investment-strategy.ts";
import type { CropClimateAssessment, CropClimateHazard } from "./crop-climate-risk.ts";
import type { DiseaseClimateAssessment } from "./crop-disease-climate-risk.ts";

function hazardKind(hazard: CropClimateHazard): AgroclimateRiskDriver["kind"] {
  if (hazard === "WATER_DEFICIT" || hazard === "EXCESS_RAIN" || hazard === "WATERLOGGING") return "WATER";
  if (
    hazard === "HEAT"
    || hazard === "COLD"
    || hazard === "HOT_NIGHTS"
    || hazard === "COLD_NIGHTS"
    || hazard === "FROST"
    || hazard === "LOW_SOIL_TEMPERATURE"
    || hazard === "HIGH_SOIL_TEMPERATURE"
    || hazard === "HIGH_VPD"
    || hazard === "THERMAL_AMPLITUDE_STRESS"
    || hazard === "INSUFFICIENT_CHILL"
  ) return "TEMPERATURE";
  if (
    hazard === "LOW_RADIATION"
    || hazard === "EXCESS_RADIATION"
    || hazard === "PHOTOPERIOD_MISMATCH"
  ) return "RADIATION";
  if (hazard === "HAIL" || hazard === "WIND") return "WIND_HAIL";
  return "OTHER";
}

function unique(values: string[]) {
  return [...new Set(values)];
}

/**
 * Converte avaliações agronômicas já interpretadas em drivers econômicos de risco.
 * Este adaptador NÃO altera dose, meta ou estratégia; apenas transporta evidência
 * rastreável para o planejador de investimento.
 */
export function buildAgroclimateRiskDrivers(input: {
  cropClimate?: CropClimateAssessment | null;
  diseaseClimate?: DiseaseClimateAssessment | null;
}): AgroclimateRiskDriver[] {
  const drivers: AgroclimateRiskDriver[] = [];

  for (const impact of input.cropClimate?.impacts ?? []) {
    if (impact.impact !== "ADVERSE") continue;
    drivers.push({
      kind: hazardKind(impact.hazard),
      code: impact.hazard,
      severity: impact.severity,
      description: impact.rationale,
      profileIds: [impact.profileId],
    });
  }

  for (const risk of input.diseaseClimate?.diseaseRisks ?? []) {
    if (risk.monitoringPriority === "LOW") continue;
    drivers.push({
      kind: "DISEASE",
      code: risk.diseaseCode,
      severity: risk.monitoringPriority === "HIGH" ? "HIGH" : "MEDIUM",
      description: [
        `Favorabilidade climática ${risk.climateFavorability.toLowerCase()} para ${risk.diseaseName}.`,
        `Prioridade de monitoramento: ${risk.monitoringPriority.toLowerCase()}.`,
        "Isso não confirma infecção nem autoriza tratamento automaticamente.",
      ].join(" "),
      profileIds: [risk.profileId],
    });
  }

  const grouped = new Map<string, AgroclimateRiskDriver>();
  for (const driver of drivers) {
    const key = `${driver.kind}:${driver.code}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, driver);
      continue;
    }

    const severityOrder = { LOW: 1, MEDIUM: 2, HIGH: 3 } as const;
    grouped.set(key, {
      ...existing,
      severity: severityOrder[driver.severity] > severityOrder[existing.severity]
        ? driver.severity
        : existing.severity,
      profileIds: unique([...existing.profileIds, ...driver.profileIds]),
    });
  }

  return [...grouped.values()];
}
