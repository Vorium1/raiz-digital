"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { SimpleRecommendationContext } from "@/components/simple-recommendation-context";
import { SimplePublishResultButton } from "@/components/simple-publish-result-button";

type Interpretation = {
  id: string;
  status: string;
  structuredOutput?: { interpretation?: Array<{ parameterCode: string; interpretable: boolean; classification?: string; classificationRole?: "TARGET" | "AUXILIARY" }> } | null;
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
  cultivationOrderAfterSoilAnalysis: number | null;
  pkDoseReadiness?: { ready: boolean; blockers: string[] };
  uniformPkReadiness?: { ready: boolean };
};

type Readiness = {
  allowed?: boolean;
  reason?: string | null;
  prescriptionFreshness?: { current?: boolean };
  prescriptionPkValidation?: { allowed?: boolean } | null;
  recommendationContext?: RecommendationContext;
};

type Delivery = { currentReportCount?: number };

export function SimpleFinalReview({ analysisId, canReview }: { analysisId: string; canReview: boolean }) {
  const [interpretation, setInterpretation] = useState<Interpretation | null | undefined>(undefined);
  const [prescription, setPrescription] = useState<Prescription | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  if (interpretation === undefined) return <div className="simple-review-loading"><Icon name="clock" size={18}/> Preparando a revisão…</div>;
  if (!interpretation) return null;

  const interpretationId = interpretation.id;
  const interpretationStatus = interpretation.status;
  const draft = prescription?.responsePayload?.prescription ?? null;
  const finalApproved = interpretationStatus === "APPROVED" && prescription?.status === "APPROVED";
  const published = finalApproved && (delivery?.currentReportCount ?? 0) > 0;
  const prescriptionCurrent = readiness?.prescriptionFreshness?.current !== false;
  const pkValid = readiness?.prescriptionPkValidation?.allowed !== false;
  const recommendationContext = readiness?.recommendationContext ?? null;
  const needsPkContext = Boolean(
    recommendationContext?.uniformPkReadiness?.ready === true
    && recommendationContext?.pkDoseReadiness?.ready === false
    && (recommendationContext?.pkDoseReadiness?.blockers.length ?? 0) > 0,
  );
  const canFinalize = canReview && accepted && Boolean(prescription?.id)
    && (interpretationStatus === "IN_REVIEW" || interpretationStatus === "APPROVED")
    && (prescription?.status === "PENDING_REVIEW" || prescription?.status === "APPROVED")
    && prescriptionCurrent && pkValid;

  async function prepare() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/analyses/${analysisId}/agronomic-prescription`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível preparar a recomendação.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível preparar a recomendação.");
    } finally { setBusy(false); }
  }

  async function decide(decision: "APPROVED" | "CHANGES_REQUESTED") {
    if (!prescription) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/analyses/${analysisId}/final-review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision,
          interpretationId,
          prescriptionId: prescription.id,
          ...(decision === "CHANGES_REQUESTED" ? { note: "Ajustes solicitados na revisão final." } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível concluir esta ação.");
      setAccepted(false);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível concluir esta ação.");
    } finally { setBusy(false); }
  }

  if (published) {
    return <section className="simple-final-review done"><span><Icon name="check" size={24}/></span><div><strong>Resultado publicado</strong><p>Esta decisão já está pronta para consulta e entrega.</p></div><Link href={`/resultado/${analysisId}`}>Ver resultado <Icon name="arrow" size={14}/></Link></section>;
  }

  if (finalApproved) {
    return (
      <section className="simple-final-review done">
        <span><Icon name="check" size={24}/></span>
        <div><strong>Revisão concluída</strong><p>A decisão foi aprovada. Publique a versão oficial para ela aparecer em Resultados.</p></div>
        {canReview
          ? <SimplePublishResultButton analysisId={analysisId} interpretationId={interpretationId}/>
          : <small className="simple-review-help">Um responsável técnico autorizado precisa publicar este resultado.</small>}
      </section>
    );
  }

  if (prescription && !prescriptionCurrent) {
    return (
      <section className="simple-final-review blocked">
        <div className="simple-final-review-head"><span><Icon name="warning" size={22}/></span><div><strong>A recomendação precisa ser atualizada</strong><p>Alguma informação da área mudou depois que esta versão foi preparada.</p></div></div>
        {message && <div className="simple-review-message">{message}</div>}
        <button type="button" onClick={prepare} disabled={busy || !canReview}>{busy ? "Atualizando…" : "Atualizar recomendação"}</button>
        <small className="simple-review-help">A versão anterior não pode ser aprovada como se ainda estivesse atual.</small>
      </section>
    );
  }

  if (prescription && !pkValid) {
    return (
      <section className="simple-final-review blocked">
        <div className="simple-final-review-head"><span><Icon name="warning" size={22}/></span><div><strong>Aprovação bloqueada</strong><p>A RAIZ encontrou diferença entre a recomendação preparada e o cálculo validado. Nada será alterado automaticamente.</p></div></div>
        <Link href={`/analises/${analysisId}`} className="simple-review-technical-action">Ver detalhes técnicos <Icon name="arrow" size={13}/></Link>
      </section>
    );
  }

  if (!prescription) {
    return (
      <section className="simple-final-review">
        <div className="simple-final-review-head"><span><Icon name="leaf" size={22}/></span><div><strong>Preparar recomendação</strong><p>A análise já existe; a RAIZ pode organizar a proposta para você revisar.</p></div></div>
        {needsPkContext && recommendationContext && (
          <SimpleRecommendationContext
            cropSeasonId={recommendationContext.cropSeasonId}
            blockers={recommendationContext.pkDoseReadiness?.blockers ?? []}
            yieldGoal={recommendationContext.yieldGoal}
            yieldGoalUnit={recommendationContext.yieldGoalUnit}
            cultivationOrderAfterSoilAnalysis={recommendationContext.cultivationOrderAfterSoilAnalysis}
            onSaved={load}
          />
        )}
        {message && <div className="simple-review-message">{message}</div>}
        <button type="button" onClick={prepare} disabled={busy || !canReview || readiness?.allowed === false}>
          {busy ? "Preparando…" : needsPkContext ? "Preparar com os dados disponíveis" : "Preparar recomendação"}
        </button>
        {needsPkContext && <small className="simple-review-help">Sem esse contexto, a RAIZ não inclui dose de fósforo ou potássio. O restante do relatório pode seguir normalmente.</small>}
        {readiness?.allowed === false && <small className="simple-review-help">A análise ainda não está pronta para preparar uma recomendação.</small>}
      </section>
    );
  }

  return (
    <section className="simple-final-review" id="revisar">
      <div className="simple-final-review-head"><span><Icon name="shield" size={22}/></span><div><strong>Revisão final</strong><p>Confira a recomendação preparada pela RAIZ e decida.</p></div></div>

      {needsPkContext && recommendationContext && (
        <SimpleRecommendationContext
          cropSeasonId={recommendationContext.cropSeasonId}
          blockers={recommendationContext.pkDoseReadiness?.blockers ?? []}
          yieldGoal={recommendationContext.yieldGoal}
          yieldGoalUnit={recommendationContext.yieldGoalUnit}
          cultivationOrderAfterSoilAnalysis={recommendationContext.cultivationOrderAfterSoilAnalysis}
          onSaved={load}
        />
      )}

      {draft?.summary && <div className="simple-review-summary"><span>RESUMO</span><p>{draft.summary}</p></div>}

      {(draft?.recommendations?.length ?? 0) > 0 && <div className="simple-review-recommendations"><span>RECOMENDAÇÃO</span>{draft!.recommendations!.map((item, index) => <div key={`${item.inputType}-${index}`}><strong>{item.inputType}</strong><b>{item.quantity.toLocaleString("pt-BR")} {item.unit}</b><small>{item.rationale}</small></div>)}</div>}

      {(draft?.managementPractices?.length ?? 0) > 0 && <div className="simple-review-practices"><span>MANEJO</span><ul>{draft!.managementPractices!.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}

      {(draft?.missingInformation?.length ?? 0) > 0 && <div className="simple-review-missing"><Icon name="warning" size={17}/><div><strong>Ainda falta informação</strong><ul>{draft!.missingInformation!.map((item, index) => <li key={index}>{item}</li>)}</ul></div></div>}

      {message && <div className="simple-review-message">{message}</div>}

      {canReview ? <>
        <label className="simple-review-confirm"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)}/><span>Conferi os dados, a recomendação e as limitações apresentadas.</span></label>
        <div className="simple-review-actions"><button type="button" className="secondary" disabled={busy || prescription.status !== "PENDING_REVIEW"} onClick={() => void decide("CHANGES_REQUESTED")}>Pedir ajuste</button><button type="button" disabled={busy || !canFinalize} onClick={() => void decide("APPROVED")}>{busy ? "Salvando…" : "Aprovar revisão"}</button></div>
      </> : <p className="simple-review-help">A revisão final precisa ser feita por um perfil técnico autorizado.</p>}

      <details className="simple-review-more"><summary>Ver informações técnicas da revisão</summary><Link href={`/analises/${analysisId}`}>Abrir modo técnico completo <Icon name="arrow" size={13}/></Link></details>
    </section>
  );
}
