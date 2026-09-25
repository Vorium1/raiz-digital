import {
  effectivePointCoordinates,
  pointPositionKind,
  type MapPoint,
  type PointPositionKind,
} from "@/components/spatial-map-types";
import {
  assessSoilSatelliteTemporalRelation,
  classifyNdviObservationQuality,
  NDVI_QUALITY_LABELS,
} from "@/domain/ndvi-engine";
import styles from "./soil-satellite-evidence-context.module.css";

type SatelliteSnapshot = {
  capturedAt: string;
  meanNdvi: number;
  cloudCoverPct?: number | null;
};

type SoilContext = {
  collectionOrderCode: string;
  seasonLabel: string;
  depthFromCm: number;
  depthToCm: number;
};

function formatDateOnly(value: string | null | undefined) {
  if (!value) return "Não registrada";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("pt-BR");
}

function positionLabel(kind: PointPositionKind) {
  if (kind === "OBSERVED") return "GPS observado";
  if (kind === "AUDITED_SOURCE") return "Fonte espacial auditada";
  return "Posição planejada";
}

function temporalLabel(status: ReturnType<typeof assessSoilSatelliteTemporalRelation>["status"]) {
  if (status === "SAME_DATE") return "Mesma data";
  if (status === "DATE_GAP") return "Datas diferentes";
  if (status === "SOIL_DATE_MISSING") return "Data do solo ausente";
  if (status === "SATELLITE_DATE_MISSING") return "Data do satélite ausente";
  return "Imagem não acionável";
}

export function SoilSatelliteEvidenceContext({
  parameterCode,
  points,
  satellite,
  soilContext,
}: {
  parameterCode: string;
  points: MapPoint[];
  satellite: SatelliteSnapshot | null;
  soilContext?: SoilContext | null;
}) {
  if (!parameterCode) return null;

  const satelliteQuality = satellite
    ? classifyNdviObservationQuality({ cloudCoverPct: satellite.cloudCoverPct ?? null })
    : "INDETERMINADA";

  return (
    <section className={styles.card} data-testid="soil-satellite-evidence-context" aria-label="Contexto auditável Solo × Satélite">
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>EVIDÊNCIA CRUZADA · SOLO × SATÉLITE</span>
          <h3>{parameterCode} nos pontos reais × aquisição NDVI escolhida</h3>
          <p>Os dois conjuntos permanecem independentes. A RAIZ mostra co-localização e distância temporal, mas não calcula correlação nem atribui causa.</p>
        </div>
      </div>

      <div className={styles.summary}>
        <article>
          <span>Solo</span>
          <strong>{points.length} {points.length === 1 ? "ponto" : "pontos"}</strong>
          <small>
            {soilContext
              ? `${soilContext.collectionOrderCode} · ${soilContext.seasonLabel} · ${soilContext.depthFromCm}–${soilContext.depthToCm} cm`
              : "Profundidade e data preservadas por ponto"}
          </small>
        </article>
        <article>
          <span>Satélite</span>
          <strong>{satellite ? formatDateOnly(satellite.capturedAt) : "Sem aquisição selecionada"}</strong>
          <small>
            {satellite
              ? `NDVI médio ${satellite.meanNdvi.toFixed(2)} · ${NDVI_QUALITY_LABELS[satelliteQuality]}`
              : "Evidência temporal indisponível"}
          </small>
        </article>
        <article>
          <span>Regra temporal</span>
          <strong>Sem corte de dias inventado</strong>
          <small>Distância de calendário, sozinha, não define comparabilidade agronômica.</small>
        </article>
      </div>

      {points.length === 0 ? (
        <p className={styles.empty}>Nenhum ponto com evidência deste parâmetro foi encontrado para a coleta selecionada.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Ponto</th>
                <th>Resultado do solo</th>
                <th>Posição efetiva</th>
                <th>Coleta</th>
                <th>Satélite</th>
                <th>Relação temporal</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => {
                const effective = effectivePointCoordinates(point);
                const positionKind = pointPositionKind(point);
                const temporal = assessSoilSatelliteTemporalRelation({
                  soilCollectedAt: point.collectedAt,
                  satelliteCapturedAt: satellite?.capturedAt ?? null,
                  satelliteCloudCoverPct: satellite?.cloudCoverPct ?? null,
                });
                return (
                  <tr key={point.id}>
                    <td data-label="Ponto">
                      <strong>{point.code}</strong>
                      <small>{point.classification ?? (point.notInterpretableReason ? "Não interpretável" : "Sem classificação corrente")}</small>
                    </td>
                    <td data-label="Resultado do solo">
                      <strong>{point.value != null ? `${point.value} ${point.unit ?? ""}`.trim() : "Sem resultado"}</strong>
                      <small>{point.method ?? "Método não informado"}</small>
                    </td>
                    <td data-label="Posição efetiva">
                      <strong>{effective.latitude.toFixed(7)}, {effective.longitude.toFixed(7)}</strong>
                      <small>
                        {positionLabel(positionKind)}
                        {point.accuracyM != null ? ` · ±${point.accuracyM} m` : ""}
                      </small>
                      {positionKind === "PLANNED" && <em>Não tratar como coordenada medida em campo.</em>}
                    </td>
                    <td data-label="Coleta">
                      <strong>{formatDateOnly(point.collectedAt)}</strong>
                      <small>{point.depthFromCm}–{point.depthToCm} cm</small>
                    </td>
                    <td data-label="Satélite">
                      <strong>{satellite ? formatDateOnly(satellite.capturedAt) : "Não disponível"}</strong>
                      <small>{satellite ? `NDVI ${satellite.meanNdvi.toFixed(2)} · ${NDVI_QUALITY_LABELS[temporal.satelliteQuality]}` : "Sem raster selecionado"}</small>
                    </td>
                    <td data-label="Relação temporal">
                      <strong>{temporalLabel(temporal.status)}</strong>
                      {temporal.daysApart != null && <small>{temporal.daysApart} {temporal.daysApart === 1 ? "dia" : "dias"} de separação</small>}
                      <em>{temporal.note}</em>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className={styles.caveat}>
        Coincidência espacial ou proximidade temporal não prova que o estado do solo causou o padrão do NDVI. Cultura, fenologia, manejo, clima e demais evidências precisam ser conferidos antes de qualquer conclusão.
      </p>
    </section>
  );
}
