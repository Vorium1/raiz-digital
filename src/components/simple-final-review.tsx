"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { SimpleRecommendationContext } from "@/components/simple-recommendation-context";
import { SimplePublishResultButton } from "@/components/simple-publish-result-button";
import { recommendationInputLabel } from "@/domain/recommendation-display";

type Interpretation = {
  id: string;
  status: string;
};

type Prescription = {
  id: string;
  status: string;
  responsePayload?: { prescription?: {
    summary?: string;
    recommendations?: Array<{ inputType: string; quantity: number; unit: string; rationale: string }>;
    managementPractices?: string[];
    missingInformation?: string[];
  } } | null;
};

type RecommendationContext = {
  cropSeasonId: string;
  yieldGoal: number | null;
  yieldGoalUnit: string | null;
  managementSystem: string | null;
  cropProfileCode: string | null;
  cultivationOrderAfterSoilAnalysis: number | null;
  pkDoseReadiness?: { ready: boolean; blockers: string[] };
  uniformPkReadiness?: { ready: boolean };
};

type Readiness = {
  allowed?: boolean;
  reason?: string | null;
  interpretationEvidenceFreshness?: { current?: boolean; reason?: string | null };
  prescriptionFreshness?: { current?: boolean };
  prescriptionPkValidation?: { allowed?: boolean } | null;
  recommendationContext?: RecommendationContext;
};

type Delivery = { currentReportCount?: number };

export function SimpleFinalReview({ analysisId, canPublish }: { analysisId: string; canPublish: boolean }) {
  const [interpretation, setInterpretation] = useState<Interpretation | null | undefined>(undefined);
  const [prescription, setPrescription] = useState<Prescription | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [delivery, setDelivery] = useState<Delivery | null>(null);

  async function load() {
    const [iRes, pRes, dRes] = await Promise.all([
      fetch(`/api/analyses/${analysisId}/interpretation`, { cache: "no-store" }),
      fetch(`/api/analyses/${analysisId}/agronomic-prescription`, { cache: "no-store" }),
      fetch(`/api/analyses/${analysisId}/delivery-status`, { cache: "no-store" }),
    ]);
    const i = await iRes.json().catch(() => ({}));
    const p = await pRes.json().catch(() => ({}));
    const d = await dRes.json().catch(() => ({}));
    setInterpretation(i.latest ?? null);
    setPrescription(p.latest ?? null);
    setReadiness(p.readiness ?? null);
    setDelivery(d.delivery ?? null);
  }

  useEffect(() => { void load(); }, [analysisId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (interpretation === undefined) {
    return <div className="simple-review-loading"><Icon name="clock" size={18}/> Preparando o laudo RAIZ…</div>;
  }

  const published = (delivery?.currentReportCount ?? 0) > 0;
  if (published) {
    return (
      <section className="simple-final-review done">
        <span><Icon name="check" size={24}/></span>
        <div><strong>Laudo RAIZ oficial emitido</strong><p>A versão corrente está congelada, rastreável e pronta para entrega.</p></div>
        <Link href={`/resultado/${analysisId}`}>Ver laudo <Icon name="arrow" size={14}/></Link>
      </section>
    );
  }

  const draft = prescription?.responsePayload?.prescription ?? null;
  const recommendationContext = readiness?.recommendationContext ?? null;
  const evidenceCurrent = readiness?.interpretationEvidenceFreshness?.current === true;
  const currentEngineValidation = interpretation?.status === "APPROVED" && evidenceCurrent;
  const staleReason = readiness?.interpretationEvidenceFreshness?.reason ?? null;

  return (
    <section className="simple-final-review" id="revisar">
      <div className="simple-final-review-head">
        <span><Icon name={currentEngineValidation ? "check" : "leaf"} size={22}/></span>
        <div>
          <strong>{currentEngineValidation ? "Base validada pelo motor RAIZ" : "Gerar laudo com a base agronômica atual"}</strong>
          <p>
            {currentEngineValidation
              ? canPublish
                ? "Os dados correntes já passaram pelo motor determinístico. O próximo comando gera a versão oficial."
                : "Os dados correntes já passaram pelo motor determinístico. A emissão oficial fica disponível para o perfil responsável."
              : canPublish
                ? "A RAIZ recalcula automaticamente a interpretação com as regras atuais antes de gerar o laudo. Versões antigas permanecem congeladas."
                : "A RAIZ recalcula automaticamente a interpretação com as regras atuais. A emissão oficial fica disponível para o perfil responsável."}
          </p>
        </div>
      </div>

      {!evidenceCurrent && staleReason && (
        <div className="simple-review-missing">
          <Icon name="history" size={17}/>
          <div><strong>A base mudou desde o último cálculo</strong><small>{staleReason}</small></div>
        </div>
      )}

      {recommendationContext && (
        <SimpleRecommendationContext
          cropSeasonId={recommendationContext.cropSeasonId}
          blockers={recommendationContext.pkDoseReadiness?.blockers ?? []}
          yieldGoal={recommendationContext.yieldGoal}
          yieldGoalUnit={recommendationContext.yieldGoalUnit}
          cultivationOrderAfterSoilAnalysis={recommendationContext.cultivationOrderAfterSoilAnalysis}
          cropProfileCode={recommendationContext.cropProfileCode}
          managementSystem={recommendationContext.managementSystem}
          onSaved={load}
        />
      )}

      {draft?.summary && <div className="simple-review-summary"><span>CONCLUSÃO ATUAL</span><p>{draft.summary}</p></div>}

      {(draft?.recommendations?.length ?? 0) > 0 && (
        <div className="simple-review-recommendations">
          <span>DOSES DETERMINÍSTICAS</span>
          {draft!.recommendations!.map((item, index) => (
            <div key={`${item.inputType}-${index}`}>
              <strong>{recommendationInputLabel(item.inputType)}</strong>
              <b>{item.quantity.toLocaleString("pt-BR")} {item.unit}</b>
              <small>{item.rationale}</small>
            </div>
          ))}
        </div>
      )}

      {(draft?.managementPractices?.length ?? 0) > 0 && (
        <div className="simple-review-recommendations">
          <span>ORIENTAÇÕES DE MANEJO</span>
          {draft!.managementPractices!.map((item, index) => (
            <div key={`management-${index}`}>
              <strong>{item.startsWith("Calagem") ? "Calagem" : "Manejo"}</strong>
              <small>{item}</small>
            </div>
          ))}
        </div>
      )}

      {(draft?.missingInformation?.length ?? 0) > 0 && (
        <div className="simple-review-missing">
          <Icon name="shield" size={17}/>
          <div>
            <strong>Limites registrados ({draft!.missingInformation!.length})</strong>
            <ul>{draft!.missingInformation!.map((item, index) => <li key={index}>{item}</li>)}</ul>
          </div>
        </div>
      )}

      {canPublish ? (
        <div className="simple-review-actions">
          <SimplePublishResultButton analysisId={analysisId} interpretationId={interpretation?.id}/>
        </div>
      ) : (
        <p className="simple-review-help">Seu perfil atual não possui permissão operacional para emitir o laudo.</p>
      )}

      <small className="simple-review-help">
        O laudo sempre usa a versão corrente da base técnica. Nenhuma publicação anterior é reescrita.
      </small>
    </section>
  );
}
