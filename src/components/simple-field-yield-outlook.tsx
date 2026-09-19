"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { YIELD_OUTLOOK_BLOCKER_LABELS, type YieldOutlookBlocker } from "@/domain/yield-outlook";

type Payload = {
  field: { id: string; name: string; areaHa: number };
  season: { seasonLabel?: string; currentCrop?: string | null; nextCrop?: string | null } | null;
  regional: null | {
    municipality: string;
    state: string;
    sampleYears: number;
    latest: { year: number; yieldKgHa: number } | null;
    medianKgHa: number | null;
    p25KgHa: number | null;
    p75KgHa: number | null;
    goodYearScenarioKgHa: number | null;
    scenarioScHa: number | null;
    scenarioTotalT: number | null;
    scenarioTotalSacks60kg: number | null;
    source: string;
  };
  forecastReadiness: {
    ready: boolean;
    blockers: YieldOutlookBlocker[];
    soybeanHistoryCount: number;
    ndviObservationCount: number;
  };
  sourceError: string | null;
};

const fmt = (value: number | null | undefined, digits = 1) =>
  value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("pt-BR", { maximumFractionDigits: digits });

export function SimpleFieldYieldOutlook({ fieldId }: { fieldId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/fields/${fieldId}/yield-outlook`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar o cenário de produtividade.");
        return response.json();
      })
      .then((payload) => setData(payload.outlook ?? null))
      .catch((error) => { if (!controller.signal.aborted) setData(null); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [fieldId]);

  if (loading) return <section className="simple-yield-outlook"><div className="simple-field-section-title"><span>PRODUTIVIDADE</span><h2>Preparando referência regional…</h2></div></section>;
  if (!data) return null;

  return (
    <section className="simple-yield-outlook">
      <div className="simple-field-section-title">
        <span>PRODUTIVIDADE</span>
        <h2>Cenário regional e prontidão da previsão</h2>
      </div>

      {data.regional ? (
        <div className="simple-result-ndvi-grid">
          <div><small>Referência</small><strong>{data.regional.municipality}/{data.regional.state}</strong></div>
          <div><small>Mediana municipal</small><strong>{fmt(data.regional.medianKgHa, 0)} kg/ha</strong></div>
          <div><small>Cenário regional de ano bom (P75)</small><strong>{fmt(data.regional.scenarioScHa, 1)} sc/ha</strong></div>
          <div><small>Total nesse cenário</small><strong>{fmt(data.regional.scenarioTotalSacks60kg, 0)} sc · {fmt(data.regional.scenarioTotalT, 1)} t</strong></div>
        </div>
      ) : (
        <div className="field-ops-message warning"><Icon name="warning" size={17}/><span>A referência municipal do IBGE não está disponível agora. Nenhuma produtividade foi estimada por aproximação.</span></div>
      )}

      <p className="simple-review-help">
        {data.regional
          ? `Referência estatística de ${data.regional.sampleYears} anos da ${data.regional.source}. O P75 é um cenário regional, não uma previsão deste talhão.`
          : "Sem referência regional carregada."}
      </p>

      <div className="simple-review-missing">
        <Icon name="shield" size={17}/>
        <div>
          <strong>Previsão RAIZ: ainda não liberada</strong>
          <small>O sistema só publicará uma previsão quando houver calibração de campo suficiente. Hoje existem {data.forecastReadiness.soybeanHistoryCount} safras reais registradas e {data.forecastReadiness.ndviObservationCount} leitura(s) NDVI.</small>
          <ul>{data.forecastReadiness.blockers.map((blocker) => <li key={blocker}>{YIELD_OUTLOOK_BLOCKER_LABELS[blocker]}</li>)}</ul>
        </div>
      </div>

      <a className="button ghost small" href="/coletas#produtividade">Registrar histórico real do talhão</a>
    </section>
  );
}
