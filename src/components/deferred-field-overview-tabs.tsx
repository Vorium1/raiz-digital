"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FieldOverviewTabs } from "@/components/field-overview-tabs";
import { Icon } from "@/components/icon";
import type {
  FieldOverview,
  FieldOverviewCore,
  FieldOverviewTechnicalDetails,
} from "@/lib/repositories/field-overview";
import type { OperationalAlert } from "@/lib/repositories/alerts";

export function DeferredFieldOverviewTabs({
  overview,
  alerts,
}: {
  overview: FieldOverviewCore;
  alerts: OperationalAlert[];
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(false);
  const [details, setDetails] = useState<FieldOverviewTechnicalDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  // <details> é nativo do navegador e pode ser aberto antes de o React terminar a hidratação.
  // Ao hidratar, sincronizamos com o estado real do elemento. Assim o primeiro clique nunca é perdido.
  useEffect(() => {
    const detailsElement = hostRef.current?.closest("details");
    if (!detailsElement) {
      setActive(true);
      return;
    }

    const syncOpenState = () => setActive(detailsElement.open);
    syncOpenState();
    detailsElement.addEventListener("toggle", syncOpenState);
    return () => detailsElement.removeEventListener("toggle", syncOpenState);
  }, []);

  useEffect(() => {
    if (!active || details || error) return;

    const controller = new AbortController();
    setError(null);

    void fetch(`/api/fields/${overview.field.id}/overview-technical`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
        return payload as FieldOverviewTechnicalDetails;
      })
      .then((payload) => {
        if (!controller.signal.aborted) setDetails(payload);
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : "Não foi possível carregar os detalhes técnicos.");
      });

    return () => controller.abort();
  }, [active, details, error, overview.field.id]);

  const fullOverview = useMemo<FieldOverview | null>(() => {
    if (!details) return null;
    return {
      ...overview,
      ...details,
    } as FieldOverview;
  }, [overview, details]);

  if (!active) {
    return (
      <div ref={hostRef} className="deferred-field-overview-tabs" data-state="idle">
        <p className="report-empty-note" style={{ padding: 16 }}>Abra esta seção para carregar o histórico técnico.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div ref={hostRef} className="deferred-field-overview-tabs" data-state="error">
        <div className="field-ops-message danger">
          <Icon name="warning" size={17}/>
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!fullOverview) {
    return (
      <div ref={hostRef} className="deferred-field-overview-tabs" data-state="loading">
        <div className="agro-loading" role="status">
          <Icon name="clock" size={15}/>
          Carregando detalhes técnicos…
        </div>
      </div>
    );
  }

  return (
    <div ref={hostRef} className="deferred-field-overview-tabs" data-state="ready">
      <FieldOverviewTabs overview={fullOverview} alerts={alerts}/>
    </div>
  );
}
