import { buildRegionalYieldScenario, evaluateYieldForecastReadiness, kgHaToScHa } from "@/domain/yield-outlook";
import { withTenant } from "@/lib/db";
import { fetchMunicipalSoybeanYield } from "@/lib/yield/ibge-pam-yield-provider";

export async function getFieldYieldOutlook(input: { tenantId: string; userId: string; fieldId: string }) {
  const context = await withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const fieldResult = await client.query(
      `SELECT f.id::text, f.name, f.area_ha::float8 AS "areaHa",
              p.municipality, p.state
       FROM fields f
       JOIN properties p ON p.tenant_id=f.tenant_id AND p.id=f.property_id
       WHERE f.tenant_id=$1::uuid AND f.id=$2::uuid`,
      [input.tenantId, input.fieldId],
    );
    const field = fieldResult.rows[0] as { id: string; name: string; areaHa: number; municipality: string | null; state: string | null } | undefined;
    if (!field) return null;

    const seasonResult = await client.query(
      `SELECT season_label AS "seasonLabel", current_crop AS "currentCrop", next_crop AS "nextCrop",
              cultivar, next_cultivar AS "nextCultivar"
       FROM crop_seasons
       WHERE tenant_id=$1::uuid AND field_id=$2::uuid
       ORDER BY created_at DESC LIMIT 1`,
      [input.tenantId, input.fieldId],
    );
    const yieldResult = await client.query(
      `SELECT season_label AS "seasonLabel", crop, cultivar, yield_value::float8 AS "yieldValue", yield_unit AS "yieldUnit"
       FROM field_yield_history
       WHERE tenant_id=$1::uuid AND field_id=$2::uuid
       ORDER BY created_at DESC`,
      [input.tenantId, input.fieldId],
    );
    const ndviResult = await client.query(
      `SELECT captured_at::text AS "capturedAt", mean_ndvi::float8 AS "meanNdvi"
       FROM field_ndvi_snapshots
       WHERE tenant_id=$1::uuid AND field_id=$2::uuid
       ORDER BY captured_at DESC`,
      [input.tenantId, input.fieldId],
    );
    return { field, season: seasonResult.rows[0] ?? null, yieldHistory: yieldResult.rows, ndviSeries: ndviResult.rows };
  });

  if (!context) return null;
  const municipality = context.field.municipality?.trim() ?? "";
  const state = context.field.state?.trim() ?? "";
  if (!municipality || !state) {
    return {
      field: context.field,
      season: context.season,
      regional: null,
      forecastReadiness: evaluateYieldForecastReadiness({
        cropCurrent: context.season?.currentCrop ?? null,
        cultivar: context.season?.cultivar ?? null,
        yieldHistory: context.yieldHistory,
        ndviSeries: context.ndviSeries,
      }),
      sourceError: "MUNICIPALITY_NOT_CONFIGURED",
    };
  }

  try {
    const municipal = await fetchMunicipalSoybeanYield({ municipality, state, years: 10 });
    const regional = buildRegionalYieldScenario(municipal.observations);
    const areaHa = Number(context.field.areaHa);
    const scenarioKgHa = regional.goodYearScenarioKgHa;
    return {
      field: context.field,
      season: context.season,
      regional: {
        ...regional,
        municipality,
        state,
        municipalityCode: municipal.municipalityCode,
        source: "IBGE/PAM · SIDRA tabela 5457",
        sourceUrl: municipal.sourceUrl,
        latestScHa: regional.latest == null ? null : kgHaToScHa(regional.latest.yieldKgHa),
        medianScHa: regional.medianKgHa == null ? null : kgHaToScHa(regional.medianKgHa),
        scenarioScHa: scenarioKgHa == null ? null : kgHaToScHa(scenarioKgHa),
        scenarioTotalKg: scenarioKgHa == null ? null : scenarioKgHa * areaHa,
        scenarioTotalT: scenarioKgHa == null ? null : scenarioKgHa * areaHa / 1000,
        scenarioTotalSacks60kg: scenarioKgHa == null ? null : scenarioKgHa * areaHa / 60,
      },
      forecastReadiness: evaluateYieldForecastReadiness({
        cropCurrent: context.season?.currentCrop ?? null,
        cultivar: context.season?.cultivar ?? null,
        yieldHistory: context.yieldHistory,
        ndviSeries: context.ndviSeries,
      }),
      sourceError: null,
    };
  } catch (error) {
    return {
      field: context.field,
      season: context.season,
      regional: null,
      forecastReadiness: evaluateYieldForecastReadiness({
        cropCurrent: context.season?.currentCrop ?? null,
        cultivar: context.season?.cultivar ?? null,
        yieldHistory: context.yieldHistory,
        ndviSeries: context.ndviSeries,
      }),
      sourceError: error instanceof Error ? error.message : "IBGE_SOURCE_UNAVAILABLE",
    };
  }
}
