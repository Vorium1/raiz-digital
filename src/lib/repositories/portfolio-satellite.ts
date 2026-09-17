import { analyzeNdviTemporalHistory, type NdviObservationQuality } from "@/domain/ndvi-engine";
import { withTenant } from "@/lib/db";

export type PortfolioSatelliteStatus =
  | "QUEDA"
  | "ALTA"
  | "ESTAVEL"
  | "SEM_BASELINE"
  | "QUALIDADE_BAIXA"
  | "QUALIDADE_INDETERMINADA";

export type PortfolioSatelliteSignal = {
  fieldId: string;
  status: PortfolioSatelliteStatus;
  latestCapturedAt: string;
  latestMeanNdvi: number;
  latestQuality: NdviObservationQuality;
  deltaFromBaseline: number | null;
  baselineCount: number;
  /** Data mais recente que pode ser exibida como raster histórico imutável. */
  latestArchivedRasterCapturedAt: string | null;
};

type SnapshotRow = {
  fieldId: string;
  capturedAt: string;
  meanNdvi: number;
  cloudCoverPct: number | null;
  latestArchivedRasterCapturedAt: string | null;
};

/**
 * Um sinal satélite por talhão para a visão de carteira. Busca no máximo as seis aquisições mais
 * recentes de cada talhão em uma única consulta e reaproveita exatamente o mesmo motor temporal do
 * Talhão 360°. Em paralelo, uma window function resolve a data mais recente que possui raster
 * arquivado entre TODO o histórico do talhão, antes do corte das seis leituras temporais. Assim a
 * tendência pode usar a leitura estatística mais recente sem fingir que ela já possui imagem de
 * custódia, e o dashboard não precisa fazer N+1 para descobrir qual raster pode exibir.
 */
export async function listPortfolioSatelliteSignals(
  tenantId: string,
  userId?: string,
): Promise<PortfolioSatelliteSignal[]> {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query<SnapshotRow>(
      `WITH ranked AS (
         SELECT field_id::text AS "fieldId", captured_at::text AS "capturedAt",
                mean_ndvi::float8 AS "meanNdvi", cloud_cover_pct::float8 AS "cloudCoverPct",
                (MAX(captured_at) FILTER (WHERE raster_object_key IS NOT NULL)
                  OVER (PARTITION BY field_id))::text AS "latestArchivedRasterCapturedAt",
                row_number() OVER (PARTITION BY field_id ORDER BY captured_at DESC, created_at DESC) AS rn
         FROM field_ndvi_snapshots
         WHERE tenant_id = $1::uuid
       )
       SELECT "fieldId", "capturedAt", "meanNdvi", "cloudCoverPct", "latestArchivedRasterCapturedAt"
       FROM ranked
       WHERE rn <= 6
       ORDER BY "fieldId", "capturedAt"`,
      [tenantId],
    );

    const byField = new Map<string, SnapshotRow[]>();
    for (const row of result.rows) {
      const rows = byField.get(row.fieldId) ?? [];
      rows.push(row);
      byField.set(row.fieldId, rows);
    }

    const signals: PortfolioSatelliteSignal[] = [];
    for (const [fieldId, history] of byField) {
      const temporal = analyzeNdviTemporalHistory(history);
      if (!temporal.latestCapturedAt || temporal.latestMeanNdvi == null) continue;

      let status: PortfolioSatelliteStatus;
      if (temporal.latestQuality === "BAIXA") status = "QUALIDADE_BAIXA";
      else if (temporal.latestQuality === "INDETERMINADA") status = "QUALIDADE_INDETERMINADA";
      else if (temporal.hasRelevantTemporalChange && temporal.direction === "QUEDA") status = "QUEDA";
      else if (temporal.hasRelevantTemporalChange && temporal.direction === "ALTA") status = "ALTA";
      else if (temporal.baselineMedian != null) status = "ESTAVEL";
      else status = "SEM_BASELINE";

      signals.push({
        fieldId,
        status,
        latestCapturedAt: temporal.latestCapturedAt,
        latestMeanNdvi: temporal.latestMeanNdvi,
        latestQuality: temporal.latestQuality,
        deltaFromBaseline: temporal.deltaFromBaseline,
        baselineCount: temporal.baselineCount,
        latestArchivedRasterCapturedAt: history.at(-1)?.latestArchivedRasterCapturedAt ?? null,
      });
    }

    return signals;
  });
}
