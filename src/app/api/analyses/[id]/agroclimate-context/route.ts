import {
  parseExplicitZarcSeasonLabel,
  resolveInitialAgroclimateCivilTime,
} from "@/domain/agroclimate-analysis-context";
import { getPlatformSession } from "@/lib/auth/session";
import { collectOfficialAgroclimateEnrichment } from "@/lib/agroclimate/official-enrichment";
import { collectInmetRegionalObservation } from "@/lib/agroclimate/inmet-regional-observation";
import { getAnalysisAgroclimateLocationContext } from "@/lib/repositories/analysis-agroclimate-context";
import { resolveTechnicalRegionsForLocation } from "@/lib/repositories/agronomic-profiles";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });

  const { id } = await context.params;
  const location = await getAnalysisAgroclimateLocationContext({
    tenantId: session.tenantId,
    userId: session.userId,
    analysisId: id,
  });
  if (!location) return Response.json({ error: "Análise não encontrada." }, { status: 404 });

  const warnings: string[] = [];
  let resolvedRegions: Array<{ code?: string; specificityScore?: number }> = [];
  try {
    resolvedRegions = await resolveTechnicalRegionsForLocation({
      tenantId: session.tenantId,
      userId: session.userId,
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

  const enrichment = await collectOfficialAgroclimateEnrichment({
    latitude: location.latitude,
    longitude: location.longitude,
    utcOffset: civilTime?.utcOffset ?? null,
    technicalRegionCodes: uniqueTechnicalRegionCodes,
    zarcSeason,
  });

  const fieldRegionRefs = resolvedRegions.flatMap((region) =>
    region.code?.trim() && Number.isFinite(region.specificityScore)
      ? [{
          code: region.code.trim().toUpperCase(),
          specificityScore: Number(region.specificityScore),
        }]
      : []
  );

  const inmetObservation = await collectInmetRegionalObservation({
    fieldLatitude: location.latitude,
    fieldLongitude: location.longitude,
    fieldRegions: fieldRegionRefs,
    resolveStationRegions: async (station) => {
      const regions = await resolveTechnicalRegionsForLocation({
        tenantId: session.tenantId,
        userId: session.userId,
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
  });

  return Response.json({
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
  }, {
    headers: { "cache-control": "no-store" },
  });
}
