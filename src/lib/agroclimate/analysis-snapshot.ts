import {
  parseExplicitZarcSeasonLabel,
  resolveInitialAgroclimateCivilTime,
} from "@/domain/agroclimate-analysis-context";
import { buildReportAgroclimateSnapshot } from "@/domain/report-agroclimate-snapshot";
import { collectOfficialAgroclimateEnrichment } from "@/lib/agroclimate/official-enrichment";
import { collectInmetRegionalObservation } from "@/lib/agroclimate/inmet-regional-observation";
import { resolveTechnicalRegionsForLocation } from "@/lib/repositories/agronomic-profiles";
import { getAnalysisAgroclimateLocationContext } from "@/lib/repositories/analysis-agroclimate-context";

export async function collectAnalysisAgroclimateSnapshot(input: {
  tenantId: string;
  userId: string;
  analysisId: string;
  sourceTimeoutMs?: number;
}) {
  const location = await getAnalysisAgroclimateLocationContext({
    tenantId: input.tenantId,
    userId: input.userId,
    analysisId: input.analysisId,
  });
  if (!location) return null;

  const warnings: string[] = [];
  let resolvedRegions: Array<{ code?: string; specificityScore?: number }> = [];
  try {
    resolvedRegions = await resolveTechnicalRegionsForLocation({
      tenantId: input.tenantId,
      userId: input.userId,
      countryCode: "BR",
      stateCode: location.state,
      latitude: location.latitude,
      longitude: location.longitude,
    });
  } catch {
    warnings.push("TECHNICAL_REGION_RESOLUTION_UNAVAILABLE");
  }

  const technicalRegionCodes = [
    location.technicalRegionCode,
    ...resolvedRegions.map((region) => region.code ?? null),
  ].flatMap((value) => value?.trim() ? [value.trim().toUpperCase()] : []);
  const uniqueTechnicalRegionCodes = [...new Set(technicalRegionCodes)];

  const civilTime = resolveInitialAgroclimateCivilTime(location.state);
  if (!civilTime && location.latitude != null && location.longitude != null) {
    warnings.push("AGROCLIMATE_TIME_ZONE_NOT_HOMOLOGATED_FOR_STATE");
  }

  const zarcSeason = parseExplicitZarcSeasonLabel(location.seasonLabel);
  if (!zarcSeason) warnings.push("ZARC_SEASON_NOT_EXPLICIT_IN_SEASON_LABEL");

  const fieldRegionRefs = resolvedRegions.flatMap((region) =>
    region.code?.trim() && Number.isFinite(region.specificityScore)
      ? [{
          code: region.code.trim().toUpperCase(),
          specificityScore: Number(region.specificityScore),
        }]
      : []
  );

  const [enrichment, inmetObservation] = await Promise.all([
    collectOfficialAgroclimateEnrichment({
      latitude: location.latitude,
      longitude: location.longitude,
      utcOffset: civilTime?.utcOffset ?? null,
      technicalRegionCodes: uniqueTechnicalRegionCodes,
      zarcSeason,
      sourceTimeoutMs: input.sourceTimeoutMs,
    }),
    collectInmetRegionalObservation({
      fieldLatitude: location.latitude,
      fieldLongitude: location.longitude,
      fieldRegions: fieldRegionRefs,
      sourceTimeoutMs: input.sourceTimeoutMs,
      resolveStationRegions: async (station) => {
        const regions = await resolveTechnicalRegionsForLocation({
          tenantId: input.tenantId,
          userId: input.userId,
          countryCode: "BR",
          stateCode: station.stateCode,
          latitude: station.latitude,
          longitude: station.longitude,
        });
        return regions.flatMap((region) =>
          region.code?.trim() && Number.isFinite(region.specificityScore)
            ? [{
                code: region.code.trim().toUpperCase(),
                specificityScore: Number(region.specificityScore),
              }]
            : []
        );
      },
    }),
  ]);

  const raw = {
    analysisId: location.analysisId,
    location: {
      fieldId: location.fieldId,
      state: location.state,
      municipality: location.municipality,
      latitude: location.latitude,
      longitude: location.longitude,
      coordinateSource: location.coordinateSource,
      timeZone: civilTime?.timeZone ?? null,
      utcOffset: civilTime?.utcOffset ?? null,
    },
    season: {
      label: location.seasonLabel,
      zarcSeason,
    },
    technicalRegionCodes: uniqueTechnicalRegionCodes,
    enrichment,
    inmetObservation,
    warnings: [...new Set([...warnings, ...enrichment.warnings, ...inmetObservation.warnings])],
  };

  return {
    raw,
    reportSnapshot: buildReportAgroclimateSnapshot({
      collectedAt: new Date().toISOString(),
      analysisId: raw.analysisId,
      location: {
        state: raw.location.state,
        municipality: raw.location.municipality,
        latitude: raw.location.latitude,
        longitude: raw.location.longitude,
        coordinateSource: raw.location.coordinateSource,
        timeZone: raw.location.timeZone,
        utcOffset: raw.location.utcOffset,
      },
      season: raw.season,
      technicalRegionCodes: raw.technicalRegionCodes,
      enrichment: raw.enrichment,
      inmetObservation: raw.inmetObservation,
      warnings: raw.warnings,
    }),
  };
}
