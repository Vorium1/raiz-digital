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
  approvedByName?: string | null;
  approvedAt?: string | null;
};

type PrescriptionRecommendation = {
  inputType: string;
  quantity: number;
  unit: string;
  rationale: string;
};

type PrescriptionDraft = {
  summary: string;
  diagnosis: Array<{
    parameterCode: string;
    value: number;
    unit: string;
    interpretation: string;
    rationale: string;
  }>;
  recommendations: PrescriptionRecommendation[];
  managementPractices: string[];
  missingInformation: string[];
  sources: Array<{ title: string; institution: string | null; url: string | null }>;
};

type PrescriptionGeneration = {
  id: string;
  provider: string;
  model: string;
  promptVersion: string;
  status: string;
  createdAt: string;
  reviewedAt?: string | null;
  reviewedByName?: string | null;
  responsePayload?: {
    prescription?: PrescriptionDraft;
    isRealLanguageModel?: boolean;
  } | null;
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
  prescriptionFreshness?: { current?: boolean; reason?: string | null };
  prescriptionPkValidation?: { allowed?: boolean; failures?: Array<{ blockers?: string[] }> } | null;
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
  IN_REVIEW: "Aguardando revisão final",
  APPROVED: "Aprovada tecnicamente",
  PENDING_REVIEW: "Rascunho para revisão",
  CHANGES_REQUESTED: "Ajustes solicitados",
  REJECTED: "Rascunho rejeitado",
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

export function Ux2TechnicalReview({ analysisId, canReview }: { analysisId: string; canReview: boolean }) {
  const [interpretation, setInterpretation] = useState<Interpretation | null | undefined>(undefined);
  const [prescription, setPrescription] = useState<PrescriptionGeneration | null>(null);
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
    setPrescription(prescriptionPayload.latest ?? null);
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
  const draft = prescription?.responsePayload?.prescription ?? null;
  const recommendations = draft?.recommendations ?? [];
  const doses = readiness?.recommendationContext?.deterministicPkDoses;
  const doseItems = useMemo(() => (["P2O5", "K2O"] as const).map((nutrient) => ({ nutrient, decision: doses?.[nutrient] })), [doses]);
  const readyDoses = doseItems.filter((item) => item.decision?.ready && item.decision.expected);
  const blockedDoses = doseItems.filter((item) => !item.decision?.ready);
  const finalApproved = interpretation?.status === "APPROVED" && prescription?.status === "APPROVED";
  const prescriptionCurrent = readiness?.prescriptionFreshness?.current !== false;
  const pkValidated = readiness?.prescriptionPkValidation?.allowed !== false;
  const canFinalize = canReview
    && accepted
    && Boolean(interpretation?.id)
    && Boolean(prescription?.id)
    && (interpretation?.status === "IN_REVIEW" || interpretation?.status === "APPROVED")
    && (prescription?.status === "PENDING_REVIEW" || prescription?.status === "APPROVED")
    && prescriptionCurrent
    && pkValidated;

  async function prepareDraft() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/analyses/${analysisId}/agronomic-prescription`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível preparar o rascunho da recomendação.");
      setMessage({ tone: "success", text: "Rascunho preparado para a revisão técnica final." });
      await load();
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível preparar o rascunho da recomendação." });
    } finally {
      setBusy(false);
    }
  }

  async function approveFinalReview() {
    if (!interpretation || !prescription || !canFinalize) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/analyses/${analysisId}/final-review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ interpretationId: interpretation.id, prescriptionId: prescription.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível concluir a revisão final.");
      setAccepted(false);
      setMessage({ tone: "success", text: "Revisão final concluída. Interpretação e recomendação foram aprovadas na mesma transação auditável." });
      await load();
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível concluir a revisão final." });
    } finally {
      setBusy(false);
    }
  }

  async function requestPrescriptionChanges() {
    if (!prescription || prescription.status !== "PENDING_REVIEW" || !canReview) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/agronomic-prescriptions/${prescription.id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "CHANGES_REQUESTED", note: "Ajustes solicitados na revisão final UX 2.0." }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível solicitar ajustes.");
      setAccepted(false);
      setMessage({ tone: "success", text: "Ajustes solicitados. A versão atual permanece auditada e não foi promovida como recomendação oficial." });
      await load();
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível solicitar ajustes." });
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
          <span className="eyebrow">ETAPA 5 · REVISÃO FINAL</span>
          <h2>A RAIZ preparou o trabalho. Confira e decida uma vez.</h2>
          <p>Interpretação, recomendação em rascunho, evidências, regras, fontes e limitações ficam reunidas aqui. A aprovação final é uma única ação para o agrônomo.</p>
        </div>
        <StatusBadge tone={finalApproved ? "success" : interpretation.status === "IN_REVIEW" ? "waiting" : "info"}>
          {finalApproved ? "Revisão final aprovada" : statusLabel[interpretation.status] ?? interpretation.status}
        </StatusBadge>
      </div>

      {message && <div className={`agro-message ${message.tone}`}><Icon name={message.tone === "success" ? "check" : "warning"} size={15}/><span>{message.text}</span></div>}

      <div className="ux2-review-flow" aria-label="Etapas do fluxo">
        {[
          ["check", "Dados recebidos"],
          ["check", "Processados"],
          ["check", "Analisados"],
          [prescription ? "check" : "clock", "Recomendação preparada"],
          [finalApproved ? "check" : "shield", "Revisão final"],
          [finalApproved ? "arrow" : "clock", "Pronto para publicar"],
        ].map(([icon, label], index) => <div key={label} className={index < 4 || finalApproved ? "done" : index === 4 ? "current" : ""}><span><Icon name={icon as any} size={14}/></span><small>{label}</small></div>)}
      </div>

      <div className="ux2-review-grid">
        <div className="ux2-review-main">
          <section className="ux2-review-section ux2-draft-recommendation">
            <div className="ux2-review-section-head">
              <div><span className="eyebrow">RECOMENDAÇÃO PREPARADA</span><h3>{draft ? "Rascunho real vinculado a esta análise" : "Rascunho ainda não disponível"}</h3></div>
              <span className="ux2-draft-badge">{prescription?.status === "APPROVED" ? "APROVADA" : "NÃO OFICIAL"}</span>
            </div>

            {draft ? (
              <>
                <p className="ux2-review-help">{draft.summary}</p>
                <div className="ux2-dose-list">
                  {recommendations.map((item, index) => (
                    <article key={`${item.inputType}-${index}`} className="ux2-dose-item ready">
                      <span className="ux2-dose-icon"><Icon name="leaf" size={18}/></span>
                      <div><small>{item.inputType}</small><strong>{item.quantity.toLocaleString("pt-BR")} {item.unit}</strong><span>{item.rationale}</span></div>
                    </article>
                  ))}
                  {recommendations.length === 0 && <div className="ux2-review-placeholder"><Icon name="warning" size={18}/><span>O rascunho não propôs dose com a evidência atual.</span></div>}
                </div>

                {draft.missingInformation.length > 0 && (
                  <div className="ux2-review-warning"><Icon name="warning" size={15}/><span><strong>Informações ainda ausentes:</strong> {draft.missingInformation.join(" · ")}</span></div>
                )}

                {draft.managementPractices.length > 0 && (
                  <details className="ux2-audit-blockers"><summary>Práticas de manejo sugeridas ({draft.managementPractices.length})</summary><ul>{draft.managementPractices.map((item, index) => <li key={index}><span>{item}</span></li>)}</ul></details>
                )}
              </>
            ) : (
              <div className="ux2-review-placeholder">
                <Icon name="clock" size={18}/>
                <span>{readiness?.reason ?? "A interpretação existe, mas a recomendação ainda não pôde ser preparada."}</span>
                {canReview && readiness?.allowed && <button className="button secondary" disabled={busy} onClick={() => void prepareDraft()}>{busy ? "Preparando…" : "Preparar rascunho agora"}</button>}
              </div>
            )}

            {prescription?.status === "CHANGES_REQUESTED" && canReview && (
              <div className="ux2-review-warning"><Icon name="history" size={15}/><span><strong>Esta versão recebeu solicitação de ajustes.</strong> Gere uma nova versão; a anterior permanece preservada na trilha de auditoria.</span><button className="button secondary" disabled={busy} onClick={() => void prepareDraft()}>Gerar nova versão</button></div>
            )}
          </section>

          <section className="ux2-review-section">
            <div className="ux2-review-section-head"><div><span className="eyebrow">CONFERÊNCIA DETERMINÍSTICA P/K</span><h3>O que o motor consegue liberar sem estimativa</h3></div></div>
            <p className="ux2-review-help">P₂O₅ e K₂O do rascunho são revalidados no servidor antes de persistir e novamente antes de qualquer promoção oficial.</p>
            <div className="ux2-dose-list">
              {readyDoses.map(({ nutrient, decision }) => {
                const expected = decision!.expected!;
                return (
                  <article key={nutrient} className="ux2-dose-item ready">
                    <span className="ux2-dose-icon"><Icon name="shield" size={18}/></span>
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
            </div>
          </section>

          <section className="ux2-review-section">
            <div className="ux2-review-section-head"><div><span className="eyebrow">DIAGNÓSTICO</span><h3>O que foi interpretado</h3></div><strong>{classified.length}/{targetFindings.length || 0}</strong></div>
            <div className="ux2-finding-summary">
              {classified.slice(0, 8).map((item, index) => <div key={`${item.sampleCode}-${item.parameterCode}-${index}`}><span>{item.parameterCode}</span><strong>{item.classification ?? "Classificado"}</strong><small>{item.sampleCode}</small></div>)}
              {classified.length === 0 && <div className="ux2-review-placeholder"><Icon name="warning" size={18}/><span>Nenhum parâmetro-alvo foi classificado com a evidência atual.</span></div>}
            </div>
            {blocked.length > 0 && <div className="ux2-review-warning"><Icon name="warning" size={15}/><span><strong>{blocked.length} resultado(s) permaneceram sem interpretação automática.</strong> Eles não autorizam dose.</span></div>}
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
            <div><dt>Rascunho</dt><dd>{prescription ? `${statusLabel[prescription.status] ?? prescription.status} · ${prescription.provider}/${prescription.model}` : "Não gerado"}</dd></div>
            <div><dt>Contexto do rascunho</dt><dd>{prescriptionCurrent ? "Atual" : readiness?.prescriptionFreshness?.reason ?? "Desatualizado"}</dd></div>
          </dl>

          <div className="ux2-audit-sources">
            <h4>Fontes e fórmulas determinísticas</h4>
            {readyDoses.length ? readyDoses.map(({ nutrient, decision }) => <div key={nutrient}><strong>{nutrientLabel(nutrient)}</strong><code>{decision!.expected!.ruleId}</code><small>{decision!.expected!.source}</small></div>) : <p>Nenhuma dose P/K foi liberada pelo motor determinístico.</p>}
          </div>

          {draft?.sources && draft.sources.length > 0 && (
            <div className="ux2-audit-sources">
              <h4>Referências declaradas no rascunho — conferir antes de aprovar</h4>
              {draft.sources.map((source, index) => <div key={`${source.title}-${index}`}><strong>{source.title}</strong><small>{source.institution ?? "Instituição não informada"}</small></div>)}
            </div>
          )}

          {blocked.length > 0 && <details className="ux2-audit-blockers"><summary>Ver limitações ({blocked.length})</summary><ul>{blocked.slice(0, 12).map((item, index) => <li key={`${item.sampleCode}-${item.parameterCode}-${index}`}><strong>{item.parameterCode} · {item.sampleCode}</strong><span>{item.reason ?? item.code ?? "Sem regra aplicável"}</span></li>)}</ul></details>}

          {!pkValidated && <div className="ux2-review-warning"><Icon name="warning" size={15}/><span>O rascunho atual não passou pela revalidação P/K. A aprovação final permanece bloqueada.</span></div>}
          {!prescriptionCurrent && <div className="ux2-review-warning"><Icon name="warning" size={15}/><span>{readiness?.prescriptionFreshness?.reason ?? "O contexto mudou após a geração do rascunho."}</span></div>}

          {canReview && !finalApproved && (
            <div className="ux2-signoff">
              <label className="ux2-signoff-check"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)}/><span>Conferi interpretação, recomendação, fontes, cálculos, fórmulas, evidências e limitações exibidas nesta revisão final.</span></label>
              <button className="button primary" disabled={!canFinalize || busy} onClick={() => void approveFinalReview()}><Icon name="shield" size={16}/>{busy ? "Validando gates…" : "Aprovar revisão final"}</button>
              {prescription?.status === "PENDING_REVIEW" && <button className="button ghost" disabled={busy} onClick={() => void requestPrescriptionChanges()}>Solicitar ajustes na recomendação</button>}
              {!prescription && <small>A aprovação final só é liberada quando existir um rascunho real vinculado à interpretação corrente.</small>}
              <small><Icon name="history" size={12}/>A ação final registra as duas decisões técnicas na mesma transação. Se um gate falhar, nenhuma das duas é efetivada. Não representa assinatura digital ICP-Brasil/CREA enquanto essa integração não estiver configurada.</small>
            </div>
          )}

          {finalApproved && (
            <div className="ux2-approved-box"><Icon name="check" size={20}/><div><strong>Revisão final aprovada</strong><small>{interpretation.approvedByName ?? prescription?.reviewedByName ?? "Profissional autorizado"}{interpretation.approvedAt ? ` · ${new Date(interpretation.approvedAt).toLocaleString("pt-BR")}` : ""}</small><span>Interpretação e recomendação estão aprovadas. A publicação oficial continua passando pelos gates próprios de integridade.</span></div></div>
          )}
        </aside>
      </div>
    </section>
  );
}
