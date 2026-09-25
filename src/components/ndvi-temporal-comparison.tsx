"use client";

import { useEffect, useMemo, useState } from "react";
import {
  compareNdviSnapshots,
  NDVI_QUALITY_LABELS,
  type NdviPairwisePoint,
} from "@/domain/ndvi-engine";
import { Icon } from "@/components/icon";
import styles from "./ndvi-temporal-comparison.module.css";

export type NdviTemporalSnapshot = NdviPairwisePoint & {
  id: string;
  rasterObjectKey?: string | null;
};

function formatDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("pt-BR");
}

function formatSigned(value: number, digits = 2) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function directionLabel(direction: ReturnType<typeof compareNdviSnapshots>["direction"]) {
  if (direction === "ALTA") return "Alta operacional";
  if (direction === "QUEDA") return "Queda operacional";
  if (direction === "ESTAVEL") return "Estável na triagem";
  return "Comparação não acionável";
}

export function NdviTemporalComparison({
  history,
  onViewRaster,
}: {
  history: NdviTemporalSnapshot[];
  onViewRaster?: (date: string) => void;
}) {
  const ordered = useMemo(
    () => [...history]
      .filter((item) => Number.isFinite(item.meanNdvi) && Boolean(item.capturedAt))
      .sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()),
    [history],
  );

  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");

  useEffect(() => {
    if (ordered.length < 2) {
      setAId("");
      setBId("");
      return;
    }
    const ids = new Set(ordered.map((item) => item.id));
    setAId((current) => ids.has(current) ? current : ordered[ordered.length - 2].id);
    setBId((current) => ids.has(current) ? current : ordered[ordered.length - 1].id);
  }, [ordered]);

  const a = ordered.find((item) => item.id === aId) ?? null;
  const b = ordered.find((item) => item.id === bId) ?? null;
  const comparison = useMemo(() => a && b ? compareNdviSnapshots(a, b) : null, [a, b]);

  if (ordered.length < 2) {
    return (
      <section className={styles.card} aria-label="Comparação temporal NDVI">
        <div className={styles.heading}>
          <div><span className={styles.eyebrow}>COMPARAÇÃO ENTRE DATAS</span><h3>Data A × Data B</h3></div>
        </div>
        <p className={styles.empty}>São necessárias pelo menos duas aquisições reais para comparar evolução.</p>
      </section>
    );
  }

  return (
    <section className={styles.card} aria-label="Comparação temporal NDVI">
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>COMPARAÇÃO ENTRE DATAS</span>
          <h3>Data A × Data B</h3>
          <p>Escolha duas aquisições reais do talhão. A RAIZ normaliza a ordem cronológica antes de calcular a diferença.</p>
        </div>
        {comparison && <span className={styles.direction} data-direction={comparison.direction}>{directionLabel(comparison.direction)}</span>}
      </div>

      <div className={styles.selectors}>
        <label>
          <span>Data A</span>
          <select value={aId} onChange={(event) => setAId(event.target.value)}>
            {ordered.map((snapshot) => (
              <option key={snapshot.id} value={snapshot.id}>
                {formatDateOnly(snapshot.capturedAt)} · NDVI {snapshot.meanNdvi.toFixed(2)}
              </option>
            ))}
          </select>
        </label>
        <span className={styles.versus}>×</span>
        <label>
          <span>Data B</span>
          <select value={bId} onChange={(event) => setBId(event.target.value)}>
            {ordered.map((snapshot) => (
              <option key={snapshot.id} value={snapshot.id}>
                {formatDateOnly(snapshot.capturedAt)} · NDVI {snapshot.meanNdvi.toFixed(2)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {comparison && (
        <>
          {comparison.inputOrderReversed && (
            <p className={styles.orderNote}><Icon name="history" size={13}/>As datas foram invertidas para o cálculo: a evolução abaixo sempre vai da aquisição mais antiga para a mais recente.</p>
          )}

          <div className={styles.metrics}>
            <article>
              <span>Inicial</span>
              <strong>{formatDateOnly(comparison.earlier.capturedAt)}</strong>
              <small>NDVI {comparison.earlier.meanNdvi.toFixed(2)} · {NDVI_QUALITY_LABELS[comparison.earlierQuality]}</small>
            </article>
            <article>
              <span>Final</span>
              <strong>{formatDateOnly(comparison.later.capturedAt)}</strong>
              <small>NDVI {comparison.later.meanNdvi.toFixed(2)} · {NDVI_QUALITY_LABELS[comparison.laterQuality]}</small>
            </article>
            <article>
              <span>Δ NDVI médio</span>
              <strong>{formatSigned(comparison.deltaMeanNdvi)}</strong>
              <small>{comparison.daysBetween} {comparison.daysBetween === 1 ? "dia" : "dias"} entre imagens</small>
            </article>
          </div>

          {(comparison.lowVigorDeltaPct != null || comparison.highVigorDeltaPct != null) && (
            <div className={styles.zoneChanges}>
              {comparison.lowVigorDeltaPct != null && (
                <div>
                  <span>Área em vigor baixo/sem vegetação</span>
                  <strong>{formatSigned(comparison.lowVigorDeltaPct, 1)} p.p.</strong>
                </div>
              )}
              {comparison.highVigorDeltaPct != null && (
                <div>
                  <span>Área em vigor alto/muito alto</span>
                  <strong>{formatSigned(comparison.highVigorDeltaPct, 1)} p.p.</strong>
                </div>
              )}
            </div>
          )}

          {!comparison.comparable && comparison.comparabilityReason && (
            <p className={styles.warning}><Icon name="warning" size={14}/>{comparison.comparabilityReason}</p>
          )}
          <p className={comparison.hasRelevantTemporalChange ? styles.signal : styles.note}>
            {comparison.hasRelevantTemporalChange && <Icon name="warning" size={14}/>}
            {comparison.note}
          </p>

          <div className={styles.actions}>
            {comparison.earlier.rasterObjectKey
              ? <button type="button" className="button ghost small" onClick={() => onViewRaster?.(comparison.earlier.capturedAt.slice(0, 10))}>Ver inicial no mapa</button>
              : <span>Raster inicial não arquivado</span>}
            {comparison.later.rasterObjectKey
              ? <button type="button" className="button ghost small" onClick={() => onViewRaster?.(comparison.later.capturedAt.slice(0, 10))}>Ver final no mapa</button>
              : <span>Raster final não arquivado</span>}
          </div>

          <p className={styles.caveat}><Icon name="shield" size={13}/>Mudança de NDVI descreve diferença espectral entre datas. Sozinha, ela não identifica causa, deficiência, doença, resposta a insumo nem produtividade.</p>
        </>
      )}
    </section>
  );
}
