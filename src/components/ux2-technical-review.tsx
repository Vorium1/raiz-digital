"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/ui";

type Fact = {
  sampleCode: string;
  parameterCode: string;
  value: number;
  unit: string;
  method: string;
  source?: "MEASURED" | "CALCULATED";
};

type InterpretationItem = {
  sampleCode: string;
  parameterCode: string;
  interpretable: boolean;
  classification?: string;
  reason?: string;
  code?: string;
  classificationRole?: "TARGET" | "AUXILIARY";
};

type Interpretation = {
  id: string;
  revision: number;
  status: string;
  notInterpretableReason: string | null;
  structuredOutput: null | {
    facts?: Fact[];
    interpretation?: InterpretationItem[];
    confidence?: { score: number; level: string };
    trace?: { cropProfileCode?: string | null; cropProfileVersion?: string | null; generatedAt?: string };
  };
  reviewedByName?: string | null;
  reviewedAt?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
};

type DeterministicDose = {
  ready: boolean;
  blockers: string[];
  expected: null | {
    ruleId: string;
    nutrient: "P2O5" | "K2O";
    soilLevel: string;
    doseKgPerHa: number;
    minimumKgPerHa: number;
    maximumKgPerHa: number;
    isDiscretionaryRange: boolean;
    source: string;
  };
};

type PrescriptionReadiness = {
  allowed: boolean;
  reason: string | null;
  interpretationStatus: string | null;
  interpretationId: string | null;
  interpretationEvidenceFreshness?: { current?: boolean; reason?: string | null };
  recommendationContext?: {
    cropProfileCode?: string | null;
    yieldGoal?: number | null;
    yieldGoalUnit?: string | null;
    cultivationOrderAfterSoilAnalysis?: number | null;
    deterministicPkDoses?: {
      P2O5: DeterministicDose;
      K2O: DeterministicDose;
    };
  };
};

const statusLabel: Record<string, string> = {
  CALCULATED: "Contexto incompleto",
  IN_REVIEW: "Aguardando revisão",
  APPROVED: "Aprovada tecnicamente",
  CHANGES_REQUESTED: "Revisão solicitada",
};

function formatDose(decision: DeterministicDose | undefined) {
  if (!decision?.ready || !decision.expected) return null;
  const value = decision.expected;
  if (value.isDiscretionaryRange && value.minimumKgPerHa !== value.maximumKgPerHa) {
    return `${value.minimumKgPerHa.toLocaleString("pt-BR")}–${value.maximumKgPerHa.toLocaleString("pt-BR")} kg/ha`;
  }
  return `${value.doseKgPerHa.toLocaleString("pt-BR")} kg/ha`;
}

function nutrientLabel(value: "P2O5" | "K2O") {
  return value === "P2O5" ? "Fósforo (P₂O₅)" : "Potássio (K₂O)";
}

export function Ux2TechnicalReview({
  analysisId,
  canReview,
}: {
  analysisId: string;
  canReview: boolean;
}) {
  const [interpretation, setInterpretation] = useState<Interpretation | null | undefined>(undefined);
  const [readiness, setReadiness] = useState<PrescriptionReadiness | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function load() {
    const [interpretationResponse, prescriptionResponse] = await Promise.all([
      fetch(`/api/analyses/${analysisId}/interpretation`, { cache: "no-store" }),
      fetch(`/api/analyses/${analysisId}/agronomic-prescription`, { cache: "no-store" }),
    ]);
    const interpretationPayload = await interpretationResponse.json().catch(() => ({}));
    const prescriptionPayload = await prescriptionResponse.json().catch(() => ({}));
    setInterpretation(interpretationPayload.latest ?? null);
    setReadiness(prescriptionPayload.readiness ?? null);
  }

  useEffect(() => { void load(); }, [analysisId]); // eslint-disable-line react-hooks/exhaustive-deps

  const facts = interpretation?.structuredOutput?.facts ?? [];
  const findings = interpretation?.structuredOutput?.interpretation ?? [];
  const targetFindings = findings.filter((item) => item.classificationRole !== "AUXILIARY");
  const classified = targetFindings.filter((item) => item.interpretable);
  const blocked = targetFindings.filter((item) => !item.interpretable);
  const measuredFacts = facts.filter((item) => item.source !== "CALCULATED");
  const calculatedFacts = facts.filter((item) => item.source === "CALCULATED");
  const doses = readiness?.recommendationContext?.deterministicPkDoses;
  const doseItems = useMemo(() => (["P2O5", "K2O"] as const).map((nutrient) => ({ nutrient, decision: doses?.[nutrient] })), [doses]);
  const readyDoses = doseItems.filter((item) => item.decision?.ready && item.decision.expected);
  const blockedDoses = doseItems.filter((item) => !item.decision?.ready);
  const isApproved = interpretation?.status === "APPROVED";
  const canApproveNow = canReview && interpretation?.status === "IN_REVIEW" && accepted;

  async function approve() {
    if (!interpretation || !canApproveNow) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/interpretations/${interpretation.id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approve: true }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível registrar a aprovação.");
      setAccepted(false);
      setMessage({ tone: "success", text: "Aprovação técnica registrada na trilha de auditoria." });
      await load();
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível registrar a aprovação." });
    } finally {
      setBusy(false);
    }
  }

  async function returnForReview() {
    if (!interpretation || interpretation.status !== "IN_REVIEW" || !canReview) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/interpretations/${interpretation.id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approve: false }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível registrar a revisão.");
      setMessage({ tone: "success", text: "Revisão registrada sem aprovar a interpretação." });
      await load();
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível registrar a revisão." });
    } finally {
      setBusy(false);
    }
  }

  if (interpretation === undefined) {
    return <section className="card ux2-review-workspace"><div className="agro-loading"><Icon name="clock" size={15}/>Preparando revisão técnica…</div></section>;
  }

  if (!interpretation) {
    return (
      <section className="card ux2-review-workspace ux2-review-empty">
        <Icon name="sparkles" size={26}/>
        <div><span className="eyebrow">REVISÃO TÉCNICA</span><h2>O motor ainda não gerou a interpretação.</h2><p>Os dados permanecem preservados. Complete o contexto necessário e execute novamente o processamento automático.</p></div>
      </section>
    );
  }

  return (
    <section className="card ux2-review-workspace" id="revisao-tecnica">
      <div className="ux2-review-heading">
        <div>
          <span className="eyebrow">ETAPA 5 · REVISÃO DO AGRÔNOMO</span>
          <h2>A RAIZ preparou o trabalho. Agora confira o essencial.</h2>
          <p>Esta tela reúne recomendação preliminar, evidências, regras e limitações. O objetivo é revisar a origem do cálculo — não reconstruir a análise do zero.</p>
        </div>
        <StatusBadge tone={isApproved ? "success" : interpretation.status === "IN_REVIEW" ? "waiting" : "info"}>
          {statusLabel[interpretation.status] ?? interpretation.status}
        </StatusBadge>
      </div>

      {message && <div className={`agro-message ${message.tone}`}><Icon name={message.tone === "success" ? "check" : "warning"} size={15}/><span>{message.text}</span></div>}

      <div className="ux2-review-flow" aria-label="Etapas do fluxo">
        {[
          ["check", "Dados recebidos"],
          ["check", "Processados"],
          ["check", "Analisados"],
          [readyDoses.length ? "check" : "clock", "Recomendação preparada"],
          [isApproved ? "check" : "shield", "Revisão técnica"],
          [isApproved ? "arrow" : "clock", "Entrega"],
        ].map(([icon, label], index) => <div key={label} className={index < 4 || isApproved ? "done" : index === 4 ? "current" : ""}><span><Icon name={icon as any} size={14}/></span><small>{label}</small></div>)}
      </div>

      <div className="ux2-review-grid">
        <div className="ux2-review-main">
          <section className="ux2-review-section ux2-draft-recommendation">
            <div className="ux2-review-section-head">
              <div><span className="eyebrow">RECOMENDAÇÃO PRELIMINAR DETERMINÍSTICA</span><h3>O que o motor consegue afirmar agora</h3></div>
              <span className="ux2-draft-badge">NÃO OFICIAL</span>
            </div>
            <p className="ux2-review-help">Somente itens com regra ativa, contexto suficiente e representatividade válida aparecem como dose. Ausência de evidência vira bloqueio, nunca estimativa.</p>
            <div className="ux2-dose-list">
              {readyDoses.map(({ nutrient, decision }) => {
                const expected = decision!.expected!;
                return (
                  <article key={nutrient} className="ux2-dose-item ready">
                    <span className="ux2-dose-icon"><Icon name="leaf" size={18}/></span>
                    <div><small>{nutrientLabel(nutrient)}</small><strong>{formatDose(decision)}</strong><span>Classe: {expected.soilLevel}</span></div>
                    <div className="ux2-dose-origin"><code>{expected.ruleId}</code><small>{expected.source}</small></div>
                  </article>
                );
              })}
              {blockedDoses.map(({ nutrient, decision }) => (
                <article key={nutrient} className="ux2-dose-item blocked">
                  <span className="ux2-dose-icon"><Icon name="warning" size={18}/></span>
                  <div><small>{nutrientLabel(nutrient)}</small><strong>Dose não liberada</strong><span>{decision?.blockers?.slice(0, 2).join(" · ") || "Evidência insuficiente"}</span></div>
                </article>
              ))}
              {doseItems.every((item) => !item.decision) && <div className="ux2-review-placeholder"><Icon name="clock" size={18}/><span>O contexto de recomendação ainda não está disponível para P/K.</span></div>}
            </div>
          </section>

          <section className="ux2-review-section">
            <div className="ux2-review-section-head"><div><span className="eyebrow">DIAGNÓSTICO</span><h3>O que foi interpretado</h3></div><strong>{classified.length}/{targetFindings.length || 0}</strong></div>
            <div className="ux2-finding-summary">
              {classified.slice(0, 8).map((item, index) => (
                <div key={`${item.sampleCode}-${item.parameterCode}-${index}`}><span>{item.parameterCode}</span><strong>{item.classification ?? "Classificado"}</strong><small>{item.sampleCode}</small></div>
              ))}
              {classified.length === 0 && <div className="ux2-review-placeholder"><Icon name="warning" size={18}/><span>Nenhum parâmetro-alvo foi classificado com a evidência atual.</span></div>}
            </div>
            {blocked.length > 0 && <div className="ux2-review-warning"><Icon name="warning" size={15}/><span><strong>{blocked.length} resultado(s) permaneceram sem interpretação automática.</strong> Eles ficam explícitos abaixo e não autorizam dose.</span></div>}
          </section>
        </div>

        <aside className="ux2-audit-footer">
          <div className="ux2-audit-head"><Icon name="shield" size={20}/><div><span className="eyebrow">RODAPÉ TÉCNICO E AUDITORIA</span><h3>De onde saiu</h3></div></div>

          <dl className="ux2-audit-list">
            <div><dt>Base técnica</dt><dd>{interpretation.structuredOutput?.trace?.cropProfileCode ?? "Perfil não identificado"}{interpretation.structuredOutput?.trace?.cropProfileVersion ? ` · v${interpretation.structuredOutput.trace.cropProfileVersion}` : ""}</dd></div>
            <div><dt>Revisão do motor</dt><dd>#{interpretation.revision}</dd></div>
            <div><dt>Evidência laboratorial</dt><dd>{measuredFacts.length} medição(ões) + {calculatedFacts.length} derivado(s)</dd></div>
            <div><dt>Confiabilidade</dt><dd>{interpretation.structuredOutput?.confidence ? `${Math.round(interpretation.structuredOutput.confidence.score)}/100 · ${interpretation.structuredOutput.confidence.level}` : "Não calculada"}</dd></div>
            <div><dt>Meta produtiva</dt><dd>{readiness?.recommendationContext?.yieldGoal != null ? `${readiness.recommendationContext.yieldGoal} ${readiness.recommendationContext.yieldGoalUnit ?? ""}` : "Não informada / não aplicável"}</dd></div>
          </dl>

          <div className="ux2-audit-sources">
            <h4>Fontes e fórmulas usadas nesta prévia</h4>
            {readyDoses.length ? readyDoses.map(({ nutrient, decision }) => <div key={nutrient}><strong>{nutrientLabel(nutrient)}</strong><code>{decision!.expected!.ruleId}</code><small>{decision!.expected!.source}</small></div>) : <p>Nenhuma dose P/K foi liberada pelo motor determinístico.</p>}
          </div>

          {blocked.length > 0 && <details className="ux2-audit-blockers"><summary>Ver limitações ({blocked.length})</summary><ul>{blocked.slice(0, 12).map((item, index) => <li key={`${item.sampleCode}-${item.parameterCode}-${index}`}><strong>{item.parameterCode} · {item.sampleCode}</strong><span>{item.reason ?? item.code ?? "Sem regra aplicável"}</span></li>)}</ul></details>}

          {canReview && interpretation.status === "IN_REVIEW" && (
            <div className="ux2-signoff">
              <label className="ux2-signoff-check"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)}/><span>Conferi as evidências, regras, cálculos liberados e limitações exibidas acima.</span></label>
              <button className="button primary" disabled={!canApproveNow || busy} onClick={() => void approve()}><Icon name="shield" size={16}/>{busy ? "Registrando…" : "Aprovar tecnicamente"}</button>
              <button className="button ghost" disabled={busy} onClick={() => void returnForReview()}>Registrar revisão sem aprovar</button>
              <small><Icon name="history" size={12}/>A aprovação registra usuário, data/hora, revisão e evidência corrente. Não representa assinatura digital ICP-Brasil/CREA enquanto essa integração não estiver configurada.</small>
            </div>
          )}

          {isApproved && (
            <div className="ux2-approved-box"><Icon name="check" size={20}/><div><strong>Aprovação técnica registrada</strong><small>{interpretation.approvedByName ?? "Profissional autorizado"}{interpretation.approvedAt ? ` · ${new Date(interpretation.approvedAt).toLocaleString("pt-BR")}` : ""}</small><span>A prescrição oficial pode avançar pelos gates já existentes.</span></div></div>
          )}
        </aside>
      </div>
    </section>
  );
}
