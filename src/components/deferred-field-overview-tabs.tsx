"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [details, setDetails] = useState<FieldOverviewTechnicalDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [overview.field.id]);

  const fullOverview = useMemo<FieldOverview | null>(() => {
    if (!details) return null;
    return {
      ...overview,
      ...details,
    } as FieldOverview;
  }, [overview, details]);

  if (error) {
    return (
      <div className="field-ops-message danger">
        <Icon name="warning" size={17}/>
        <span>{error}</span>
      </div>
    );
  }

  if (!fullOverview) {
    return (
      <div className="agro-loading" role="status">
        <Icon name="clock" size={15}/>
        Carregando detalhes técnicos…
      </div>
    );
  }

  return <FieldOverviewTabs overview={fullOverview} alerts={alerts}/>;
}
