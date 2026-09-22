import type { AgroclimateMetricSnapshot } from "./crop-climate-metric-engine.ts";
import type { DiseaseClimateObservation } from "./crop-disease-climate-risk.ts";

/**
 * Traduz o snapshot meteorológico canônico da RAIZ para a observação consumida
 * pelo motor de favorabilidade de doenças.
 *
 * A conversão é deliberadamente 1:1:
 * - nenhuma unidade é convertida aqui;
 * - nenhuma métrica ausente é inferida;
 * - "baixa radiação" só entra quando um sinal booleano explícito já foi
 *   determinado por uma regra climática homologada em outra camada.
 */
export function adaptAgroclimateSnapshotToDiseaseObservation(input: {
  metrics: AgroclimateMetricSnapshot;
  lowRadiationSignal?: boolean | null;
}): DiseaseClimateObservation {
  const metrics = input.metrics;
  return {
    airTemperatureC: metrics.DAY_MEAN_TEMP_C ?? null,
    nightTemperatureC: metrics.NIGHT_MEAN_TEMP_C ?? null,
    dewPointC: metrics.DEW_POINT_C ?? null,
    relativeHumidityPct: metrics.RELATIVE_HUMIDITY_PCT ?? null,
    vpdKpa: metrics.VPD_KPA ?? null,
    leafWetnessHours: metrics.LEAF_WETNESS_HOURS ?? null,
    rainfallMm: metrics.PRECIPITATION_MM ?? null,
    rainfallIntensityMmH: metrics.PRECIPITATION_INTENSITY_MM_H ?? null,
    continuousRainHours: metrics.CONTINUOUS_RAIN_HOURS ?? null,
    consecutiveWetDays: metrics.CONSECUTIVE_WET_DAYS ?? null,
    soilMoisturePct: metrics.SOIL_MOISTURE_PCT ?? null,
    windKmh: metrics.WIND_KMH ?? null,
    windGustKmh: metrics.WIND_GUST_KMH ?? null,
    sunshineHours: metrics.SUNSHINE_HOURS ?? null,
    cloudCoverPct: metrics.CLOUD_COVER_PCT ?? null,
    lowRadiationSignal:
      typeof input.lowRadiationSignal === "boolean"
        ? input.lowRadiationSignal
        : null,
  };
}
