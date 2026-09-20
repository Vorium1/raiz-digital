import type { AdaptedAgroclimateCatalog } from "./agroclimate-profile-adapter.ts";

export type AgroclimateCoverageGap =
  | "CLIMATE_PROFILE_REQUIRED"
  | "METRIC_RULES_REQUIRED"
  | "PHENOLOGY_RULES_REQUIRED"
  | "DISEASE_PROFILE_REQUIRED"
  | "ZARC_CONTEXT_REQUIRED";

function normalized(value: string) {
  return value.trim().toUpperCase();
}

function matchesRegion(
  region: { technicalRegionCodes?: string[] },
  requested: Set<string>,
) {
  const codes = region.technicalRegionCodes ?? [];
  if (!codes.length) return false;
  return codes.map(normalized).some((code) => requested.has(code));
}

/**
 * Auditor de cobertura agroclimática para expansão territorial/cultural.
 *
 * Não cria regra por analogia. Ele responde objetivamente o que já está
 * homologado para a cultura + regiões técnicas resolvidas e o que ainda precisa
 * de pesquisa/curadoria antes de entrar em decisão oficial.
 */
export function auditAgroclimateCoverage(input: {
  cropCode: string;
  technicalRegionCodes: string[];
  catalog: AdaptedAgroclimateCatalog;
}) {
  const cropCode = normalized(input.cropCode);
  const regions = new Set(input.technicalRegionCodes.map(normalized).filter(Boolean));
  if (!cropCode) throw new Error("Cultura é obrigatória para auditoria agroclimática.");
  if (!regions.size) {
    return {
      cropCode,
      technicalRegionCodes: [],
      status: "UNRESOLVED_REGION" as const,
      climateDecisionReady: false,
      phenologyDecisionReady: false,
      diseaseDecisionReady: false,
      zarcContextReady: false,
      counts: { climateProfiles: 0, metricRules: 0, phenologyRules: 0, diseaseProfiles: 0, zarcContexts: 0 },
      gaps: ["CLIMATE_PROFILE_REQUIRED", "METRIC_RULES_REQUIRED", "PHENOLOGY_RULES_REQUIRED", "DISEASE_PROFILE_REQUIRED", "ZARC_CONTEXT_REQUIRED"] as AgroclimateCoverageGap[],
      researchRequired: true as const,
    };
  }

  const climateProfiles = input.catalog.climateProfiles.filter((profile) =>
    normalized(profile.cropCode) === cropCode
    && matchesRegion(profile.region, regions)
  );
  const metricRules = input.catalog.metricRules.filter((rule) =>
    normalized(rule.cropCode) === cropCode
    && matchesRegion(rule.region, regions)
  );
  const phenologyRules = input.catalog.phenologyRules.filter((rule) =>
    normalized(rule.cropCode) === cropCode
    && matchesRegion(rule.region, regions)
  );
  const diseaseProfiles = input.catalog.diseaseProfiles.filter((profile) =>
    normalized(profile.cropCode) === cropCode
    && matchesRegion(profile.region, regions)
  );
  const zarcContexts = input.catalog.zarcContexts.filter((context) =>
    normalized(context.cropCode) === cropCode
    && regions.has(normalized(context.technicalRegionCode))
  );

  const climateDecisionReady = climateProfiles.length > 0 || metricRules.length > 0;
  const phenologyDecisionReady = phenologyRules.length > 0;
  const diseaseDecisionReady = diseaseProfiles.length > 0;
  const zarcContextReady = zarcContexts.length > 0;

  const gaps: AgroclimateCoverageGap[] = [];
  if (!climateProfiles.length) gaps.push("CLIMATE_PROFILE_REQUIRED");
  if (!metricRules.length) gaps.push("METRIC_RULES_REQUIRED");
  if (!phenologyRules.length) gaps.push("PHENOLOGY_RULES_REQUIRED");
  if (!diseaseProfiles.length) gaps.push("DISEASE_PROFILE_REQUIRED");
  if (!zarcContexts.length) gaps.push("ZARC_CONTEXT_REQUIRED");

  const coveredDimensions = [
    climateProfiles.length > 0,
    metricRules.length > 0,
    phenologyRules.length > 0,
    diseaseProfiles.length > 0,
    zarcContexts.length > 0,
  ].filter(Boolean).length;

  return {
    cropCode,
    technicalRegionCodes: [...regions],
    status: coveredDimensions === 5
      ? "FULL" as const
      : coveredDimensions === 0
        ? "NO_COVERAGE" as const
        : "PARTIAL" as const,
    climateDecisionReady,
    phenologyDecisionReady,
    diseaseDecisionReady,
    zarcContextReady,
    counts: {
      climateProfiles: climateProfiles.length,
      metricRules: metricRules.length,
      phenologyRules: phenologyRules.length,
      diseaseProfiles: diseaseProfiles.length,
      zarcContexts: zarcContexts.length,
    },
    profileIds: {
      climate: climateProfiles.map((item) => item.id),
      metrics: metricRules.map((item) => item.id),
      phenology: phenologyRules.map((item) => item.id),
      disease: diseaseProfiles.map((item) => item.id),
      zarc: zarcContexts.map((item) => item.profileCode),
    },
    gaps,
    researchRequired: gaps.length > 0,
  };
}
