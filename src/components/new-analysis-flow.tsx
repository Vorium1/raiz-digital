"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnalysisContextIntake } from "@/components/analysis-context-intake";
import { Icon } from "@/components/icon";
import { LabImporter } from "@/components/lab-importer";
import {
  buildAnalysisEvidence,
  EMPTY_ANALYSIS_CONTEXT_DRAFT,
  type AnalysisContextDraft,
} from "@/domain/analysis-context";
import { evaluateAnalysisDepthReadiness } from "@/domain/analysis-depth-readiness";
import type { AnalysisDepthId } from "@/domain/analysis-depths";
import type { LabImportPreview } from "@/domain/lab-import";

const steps = [
  { label: "Área e safra", icon: "leaf" },
  { label: "Contexto agronômico", icon: "location" },
  { label: "Laudo laboratorial", icon: "upload" },
  { label: "Conferência", icon: "check" },
] as const;

type ContextData = {
  clients: Array<{ id: string; name: string }>;
  properties: Array<{ id: string; clientId: string; name: string; municipality: string; state: string; boundary?: object | null }>;
  fields: Array<{ id: string; propertyId: string; name: string; areaHa: number; boundary?: object | null }>;
  seasons: Array<{
    id: string;
    fieldId: string;
    seasonLabel: string;
    currentCrop: string | null;
    nextCrop: string | null;
    yieldGoal: number | null;
    yieldGoalUnit: string | null;
    irrigated?: boolean;
    managementSystem?: string | null;
    soilType?: string | null;
    soilTexture?: string | null;
  }>;
  laboratories: Array<{ id: string; name: string; taxId: string | null }>;
};

type ImportPreviewWithCounts = LabImportPreview & {
  normalizedRowCount?: number;
  issueCount?: number;
};

const emptyContext: ContextData = { clients: [], properties: [], fields: [], seasons: [], laboratories: [] };

function importSourceType(fileName: string | undefined) {
  if (!fileName) return null;
  return fileName.toLowerCase().endsWith(".xlsx") || fileName.toLowerCase().endsWith(".xls") ? "XLSX" : "CSV";
}

export function NewAnalysisFlow({
  initialStep = 0,
  databaseMode = false,
  analysisDepthId,
}: {
  initialStep?: number;
  databaseMode?: boolean;
  analysisDepthId: AnalysisDepthId;
}) {
  const router = useRouter();
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 0), steps.length - 1));
  const [method, setMethod] = useState("Mehlich-1");
  const [importPreview, setImportPreview] = useState<ImportPreviewWithCounts | null>(null);
  const [importFile, setImportFile] = useState<{ fileName: string; content: string } | null>(null);
  const [analysisContextDraft, setAnalysisContextDraft] = useState<AnalysisContextDraft>(EMPTY_ANALYSIS_CONTEXT_DRAFT);
  const [context, setContext] = useState<ContextData>(emptyContext);
  const [contextLoading, setContextLoading] = useState(databaseMode);
  const [contextError, setContextError] = useState("");
  const [clientId, setClientId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [fieldId, setFieldId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [laboratoryId, setLaboratoryId] = useState("");
  const [newLabName, setNewLabName] = useState("");
  const [creatingLab, setCreatingLab] = useState(false);
  const [labError, setLabError] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState("");
  const [createdAnalysisId, setCreatedAnalysisId] = useState<string | null>(null);

  async function createLaboratory() {
    const name = newLabName.trim();
    if (!name || createdAnalysisId) return;
    setCreatingLab(true);
    setLabError("");
    try {
      const response = await fetch("/api/laboratories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível cadastrar o laboratório.");
      setContext((current) => ({
        ...current,
        laboratories: [...current.laboratories, payload.laboratory].sort((a, b) => a.name.localeCompare(b.name)),
      }));
      setLaboratoryId(payload.laboratory.id);
      setNewLabName("");
    } catch (error) {
      setLabError(error instanceof Error ? error.message : "Falha ao cadastrar laboratório.");
    } finally {
      setCreatingLab(false);
    }
  }

  useEffect(() => {
    if (!databaseMode) return;
    let alive = true;
    void fetch("/api/context", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!alive) return;
        if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar clientes e talhões.");
        setContext(payload as ContextData);
        setContextLoading(false);
      })
      .catch((error) => {
        if (!alive) return;
        setContextError(error instanceof Error ? error.message : "Falha ao carregar contexto.");
        setContextLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [databaseMode]);

  const properties = useMemo(() => context.properties.filter((item) => item.clientId === clientId), [context.properties, clientId]);
  const fields = useMemo(() => context.fields.filter((item) => item.propertyId === propertyId), [context.fields, propertyId]);
  const seasons = useMemo(() => context.seasons.filter((item) => item.fieldId === fieldId), [context.seasons, fieldId]);
  const selectedClient = context.clients.find((item) => item.id === clientId);
  const selectedProperty = context.properties.find((item) => item.id === propertyId);
  const selectedField = context.fields.find((item) => item.id === fieldId);
  const selectedSeason = context.seasons.find((item) => item.id === seasonId);

  useEffect(() => {
    if (!databaseMode || !selectedSeason || createdAnalysisId) return;
    const registeredSoil = [selectedSeason.soilType, selectedSeason.soilTexture].filter(Boolean).join(" · ");
    setAnalysisContextDraft((current) => ({
      ...current,
      waterRegime: selectedSeason.irrigated ? "IRRIGADO" : "SEQUEIRO",
      tillageSystem: selectedSeason.managementSystem?.trim() || current.tillageSystem,
      soilContextNotes: registeredSoil || current.soilContextNotes,
    }));
  }, [databaseMode, selectedSeason, createdAnalysisId]);

  const importReady = Boolean(importPreview && importPreview.blockers === 0);
  const totalImportRows = importPreview?.normalizedRowCount ?? importPreview?.rows.length ?? 0;
  const analysisOutcome = !importPreview ? "AWAITING_LAB" : importReady ? "IMPORTED" : "INCONSISTENT";
  const contextReady = databaseMode ? Boolean(clientId && propertyId && fieldId && seasonId) : true;
  const cropAvailable = databaseMode ? Boolean(selectedSeason?.nextCrop || selectedSeason?.currentCrop) : true;
  const yieldGoalAvailable = databaseMode ? selectedSeason?.yieldGoal != null : true;
  const yieldUnitAvailable = databaseMode ? Boolean(selectedSeason?.yieldGoalUnit) : true;
  const fieldBoundaryGeoreferenced = databaseMode ? Boolean(selectedField?.boundary) : false;

  const evidence = useMemo(
    () =>
      buildAnalysisEvidence(analysisContextDraft, {
        currentSoilAnalysis: importReady,
        crop: cropAvailable,
        yieldGoal: yieldGoalAvailable,
        yieldUnit: yieldUnitAvailable,
        fieldBoundaryGeoreferenced,
        registeredSoilContext: Boolean(selectedSeason?.soilType || selectedSeason?.soilTexture),
      }),
    [analysisContextDraft, importReady, cropAvailable, yieldGoalAvailable, yieldUnitAvailable, fieldBoundaryGeoreferenced, selectedSeason],
  );
  const readiness = useMemo(() => evaluateAnalysisDepthReadiness(analysisDepthId, evidence), [analysisDepthId, evidence]);
  const levelMissing = readiness.missing.filter((item) => item.blocks === "LEVEL_COMPLETION");
  const spatialMissing = readiness.missing.filter((item) => item.blocks === "SPATIAL_ONLY");

  function chooseClient(value: string) {
    if (createdAnalysisId) return;
    setClientId(value);
    setPropertyId("");
    setFieldId("");
    setSeasonId("");
  }
  function chooseProperty(value: string) {
    if (createdAnalysisId) return;
    setPropertyId(value);
    setFieldId("");
    setSeasonId("");
  }
  function chooseField(value: string) {
    if (createdAnalysisId) return;
    setFieldId(value);
    setSeasonId("");
  }

  async function finishAnalysis() {
    setFinishError("");
    if (!databaseMode) {
      alert(`Fluxo demonstrativo validado. Profundidade efetiva: ${readiness.effectiveLayer}/4. Estado do laudo: ${analysisOutcome}.`);
      return;
    }
    if (!contextReady) {
      setFinishError("Selecione cliente, propriedade, talhão e safra cadastrados antes de criar a análise.");
      setStep(0);
      return;
    }

    setFinishing(true);
    let analysisId = createdAnalysisId;
    try {
      if (!analysisId) {
        const analysisResponse = await fetch("/api/analyses", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            cropSeasonId: seasonId,
            laboratoryId: laboratoryId || undefined,
            sourceType: importSourceType(importFile?.fileName),
            analysisDepth: analysisDepthId,
            analysisContext: {
              schemaVersion: 1,
              draft: analysisContextDraft,
              evidence,
              readiness: {
                effectiveLayer: readiness.effectiveLayer,
                completeForRequestedDepth: readiness.completeForRequestedDepth,
                spatialReady: readiness.spatialReady,
                missingCodes: readiness.missing.map((item) => item.code),
                limitations: readiness.limitations,
              },
            },
          }),
        });
        const analysisPayload = await analysisResponse.json().catch(() => ({}));
        if (!analysisResponse.ok) throw new Error(analysisPayload.error ?? "Não foi possível criar a análise.");
        analysisId = analysisPayload.analysis.id as string;
        setCreatedAnalysisId(analysisId);
      }

      if (importFile) {
        const commitResponse = await fetch("/api/import/commit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            analysisId,
            content: importFile.content,
            fileName: importFile.fileName,
            fallbackMethod: method || undefined,
            hasAgronomicContext: readiness.effectiveLayer >= 2,
            // A declaração do usuário não substitui vínculo espacial persistido/provenance auditada.
            spatialLinked: false,
          }),
        });
        const commitPayload = await commitResponse.json().catch(() => ({}));
        if (!commitResponse.ok) throw new Error(commitPayload.error ?? "Análise criada, mas o laudo não pôde ser persistido.");
      }

      router.push(`/analises/${analysisId}`);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível concluir o fluxo.";
      setFinishError(analysisId && importFile ? `${message} O registro da análise já existe e será reutilizado na próxima tentativa; nenhuma análise duplicada será criada.` : message);
      if (analysisId) setStep(3);
    } finally {
      setFinishing(false);
    }
  }

  return (
    <div className="wizard-shell">
      <ol className="stepper">
        {steps.map((item, index) => (
          <li key={item.label} className={index === step ? "active" : index < step ? "done" : ""}>
            <button type="button" disabled={Boolean(createdAnalysisId) && index < 2} onClick={() => setStep(index)} aria-label={`Ir para ${item.label}`}>
              <span>{index < step ? <Icon name="check" size={15} /> : index + 1}</span>
              <div><small>ETAPA {index + 1}</small><strong>{item.label}</strong></div>
            </button>
          </li>
        ))}
      </ol>

      <section className="card wizard-card">
        {step === 0 && (
          <div className="form-section">
            <div className="form-heading">
              <span className="eyebrow">IDENTIFICAÇÃO</span>
              <h2>Onde esta análise será realizada?</h2>
              <p>{databaseMode ? "Selecione a estrutura já cadastrada. A RAIZ reaproveita o contexto conhecido e pede somente o que faltar." : "Estes dados são demonstrativos e definem o contexto técnico da experiência."}</p>
            </div>
            {databaseMode && contextLoading && <div className="import-message"><Icon name="clock" /><div><strong>Carregando estrutura agronômica…</strong><small>Clientes, propriedades, talhões e safras do tenant ativo.</small></div></div>}
            {databaseMode && contextError && <div className="import-message danger"><Icon name="warning" /><div><strong>Contexto indisponível</strong><small>{contextError}</small></div></div>}
            {databaseMode && !contextLoading && !context.clients.length && <div className="empty-context"><Icon name="users" size={24} /><div><strong>Nenhum cliente cadastrado.</strong><small>Cadastre o primeiro cliente em Clientes antes de criar uma análise real.</small></div></div>}
            <div className="form-grid">
              {databaseMode ? (
                <>
                  <label><span>Cliente *</span><select value={clientId} onChange={(event) => chooseClient(event.target.value)} disabled={Boolean(createdAnalysisId)}><option value="">Selecione o cliente</option>{context.clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <label><span>Propriedade *</span><select value={propertyId} onChange={(event) => chooseProperty(event.target.value)} disabled={!clientId || Boolean(createdAnalysisId)}><option value="">Selecione a propriedade</option>{properties.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.municipality}/{item.state}</option>)}</select></label>
                  <label><span>Talhão *</span><select value={fieldId} onChange={(event) => chooseField(event.target.value)} disabled={!propertyId || Boolean(createdAnalysisId)}><option value="">Selecione o talhão</option>{fields.map((item) => <option key={item.id} value={item.id}>{item.name} · {Number(item.areaHa).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</option>)}</select></label>
                  <label><span>Safra *</span><select value={seasonId} onChange={(event) => !createdAnalysisId && setSeasonId(event.target.value)} disabled={!fieldId || Boolean(createdAnalysisId)}><option value="">Selecione a safra</option>{seasons.map((item) => <option key={item.id} value={item.id}>{item.seasonLabel}</option>)}</select></label>
                  <label><span>Cultura atual</span><input value={selectedSeason?.currentCrop ?? ""} readOnly placeholder="Definida na safra" /></label>
                  <label><span>Próxima cultura</span><input value={selectedSeason?.nextCrop ?? ""} readOnly placeholder="Definida na safra" /></label>
                  <label><span>Meta produtiva</span><input value={selectedSeason?.yieldGoal != null ? `${selectedSeason.yieldGoal} ${selectedSeason.yieldGoalUnit ?? ""}` : ""} readOnly placeholder="Não informada" /></label>
                  <label><span>Área</span><input value={selectedField ? `${Number(selectedField.areaHa).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha` : ""} readOnly /></label>
                </>
              ) : (
                <>
                  <label><span>Cliente *</span><select defaultValue="Fazenda Horizonte"><option>Fazenda Horizonte</option></select></label>
                  <label><span>Propriedade *</span><select defaultValue="Matriz"><option>Matriz</option></select></label>
                  <label><span>Talhão *</span><select defaultValue="Talhão Norte · 42,8 ha"><option>Talhão Norte · 42,8 ha</option></select></label>
                  <label><span>Safra *</span><select defaultValue="2026/27"><option>2026/27</option></select></label>
                  <label><span>Cultura atual</span><input defaultValue="Soja" /></label>
                  <label><span>Próxima cultura</span><input defaultValue="Milho" /></label>
                  <label><span>Meta produtiva</span><input defaultValue="75 sc/ha" /></label>
                  <label><span>Área</span><input defaultValue="42,8 ha" /></label>
                </>
              )}
            </div>
            {databaseMode && contextReady && <div className="form-note"><Icon name="shield" size={19} /><div><strong>Contexto cadastral selecionado</strong><small>{selectedClient?.name} · {selectedProperty?.name} · {selectedField?.name} · {selectedSeason?.seasonLabel}</small></div></div>}
          </div>
        )}

        {step === 1 && (
          <AnalysisContextIntake depthId={analysisDepthId} value={analysisContextDraft} onChange={setAnalysisContextDraft} />
        )}

        {step === 2 && (
          <div className="form-section">
            <div className="form-heading"><span className="eyebrow">RESULTADOS</span><h2>Importe o laudo do laboratório.</h2><p>CSV ou XLSX são lidos e validados. Um arquivo inconsistente não é tratado como evidência válida só para completar o nível escolhido.</p></div>
            <div className="import-options">
              <div><Icon name="flask" /><span><strong>Laboratório</strong>{databaseMode ? <select value={laboratoryId} onChange={(event) => !createdAnalysisId && setLaboratoryId(event.target.value)} disabled={Boolean(createdAnalysisId)}><option value="">Não identificado</option>{context.laboratories.map((lab) => <option key={lab.id} value={lab.id}>{lab.name}</option>)}</select> : <select defaultValue=""><option value="">Identificar / selecionar</option><option>LabSolo</option></select>}</span></div>
              <div><Icon name="layers" /><span><strong>Extrator principal P/K</strong><select value={method} onChange={(event) => setMethod(event.target.value)}><option value="">Não informado</option><option>Mehlich-1</option><option>Resina</option><option>KCl 1 mol/L</option><option>Acetato de cálcio</option></select></span></div>
            </div>
            {databaseMode && !createdAnalysisId && <div className="new-lab-inline"><input value={newLabName} onChange={(event) => setNewLabName(event.target.value)} placeholder="Cadastrar novo laboratório pelo nome" disabled={creatingLab} /><button type="button" className="button secondary" disabled={creatingLab || !newLabName.trim()} onClick={() => void createLaboratory()}>{creatingLab ? "Salvando…" : "Cadastrar"}</button></div>}
            {labError && <div className="import-message danger"><Icon name="warning" /><div><strong>Não foi possível cadastrar</strong><small>{labError}</small></div></div>}
            <LabImporter method={method} onPreviewChange={setImportPreview} onFileReady={setImportFile} />
          </div>
        )}

        {step === 3 && (
          <div className="form-section">
            <div className="form-heading"><span className="eyebrow">PRÉ-VALIDAÇÃO</span><h2>Confira a profundidade realmente alcançada.</h2><p>O nível escolhido é a intenção. A profundidade efetiva depende dos dados presentes; itens ausentes permanecem explícitos.</p></div>
            <div className="review-grid">
              <div className="review-summary"><span>Área</span><strong>{databaseMode ? selectedField?.name || "Não selecionada" : "Talhão Norte"}</strong><small>{databaseMode ? `${selectedClient?.name ?? "—"} · ${selectedField ? Number(selectedField.areaHa).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "0"} ha` : "Fazenda Horizonte · 42,8 ha"}</small></div>
              <div className="review-summary"><span>Cultura</span><strong>{databaseMode ? `${selectedSeason?.currentCrop ?? "—"} → ${selectedSeason?.nextCrop ?? "—"}` : "Soja → Milho"}</strong><small>{databaseMode ? selectedSeason?.seasonLabel ?? "Safra não selecionada" : "Safra 2026/27"}</small></div>
              <div className="review-summary"><span>Profundidade do diagnóstico</span><strong>{readiness.effectiveLayer}/4</strong><small>{readiness.completeForRequestedDepth ? "Dados mínimos do nível solicitado declarados" : `${levelMissing.length} item(ns) mínimo(s) faltando`}</small></div>
              <div className="review-summary"><span>Laudo</span><strong>{importPreview ? `${importPreview.sampleCount} amostras` : "Ainda não importado"}</strong><small>{importPreview ? `${totalImportRows} resultados · confiança ${importPreview.confidence.score}/100` : "Pode ser anexado depois; a análise ficará incompleta"}</small></div>
            </div>

            <div className="validation-list">
              {databaseMode && !contextReady && <div className="attention danger"><Icon name="warning" /><span><strong>Contexto cadastral incompleto</strong><small>Cliente, propriedade, talhão e safra precisam existir no banco.</small></span><b>BLOQUEADO</b></div>}
              {contextReady && <div className="ok"><Icon name="check" /><span><strong>Contexto cadastral vinculado</strong><small>{databaseMode ? "IDs reais do tenant selecionados" : "Contexto demonstrativo preenchido"}</small></span><b>OK</b></div>}
              {levelMissing.length === 0 ? <div className="ok"><Icon name="check" /><span><strong>Nível solicitado documentalmente completo</strong><small>Isso não elimina gates específicos de cada cálculo ou regra agronômica.</small></span><b>OK</b></div> : <div className="attention"><Icon name="warning" /><span><strong>Faltam dados para completar o nível escolhido</strong><small>{levelMissing.map((item) => item.label).join(" · ")}</small></span><b>{levelMissing.length} PENDÊNCIA(S)</b></div>}
              {spatialMissing.length > 0 && <div className="attention"><Icon name="warning" /><span><strong>Análise espacial ainda não está pronta</strong><small>{spatialMissing.map((item) => item.label).join(" · ")}. O restante do diagnóstico não é bloqueado.</small></span><b>ESPACIAL</b></div>}
              {readiness.limitations.length > 0 && <div className="attention"><Icon name="warning" /><span><strong>Limitações declaradas</strong><small>{readiness.limitations.join(" · ")}</small></span><b>RASTREADO</b></div>}
              {!importPreview && <div className="attention"><Icon name="warning" /><span><strong>Laudo laboratorial pendente</strong><small>Nenhuma interpretação química será liberada sem o laudo validado.</small></span><b>PENDENTE</b></div>}
              {importPreview && importPreview.blockers === 0 && <div className="ok"><Icon name="check" /><span><strong>Laudo importado e normalizado</strong><small>{importPreview.parameterCount} parâmetros reconhecidos · {importPreview.warnings} itens para conferência</small></span><b>OK</b></div>}
              {importPreview && importPreview.blockers > 0 && <div className="attention danger"><Icon name="warning" /><span><strong>{importPreview.blockers} bloqueio(s) no laudo</strong><small>O arquivo não conta como análise de solo válida até a correção.</small></span><b>BLOQUEADO</b></div>}
            </div>

            <div className="workflow-decision"><Icon name="shield" size={19} /><div><span>Estado inicial do laudo</span><strong>{analysisOutcome}</strong><small>Profundidade escolhida e profundidade efetiva são persistidas separadamente. A IA não completa lacunas.</small></div></div>
            {createdAnalysisId && <div className="import-message review"><Icon name="shield" /><div><strong>Análise já criada</strong><small>Se a importação falhar, a próxima tentativa reutiliza este mesmo registro. Cliente, área e contexto ficam travados para impedir duplicidade ou troca silenciosa do vínculo.</small></div></div>}
            {finishError && <div className="import-message danger"><Icon name="warning" /><div><strong>Não foi possível concluir</strong><small>{finishError}</small></div></div>}
          </div>
        )}

        <footer className="wizard-footer">
          <button className="button ghost" onClick={() => setStep((current) => Math.max(createdAnalysisId ? 2 : 0, current - 1))} disabled={step === 0 || finishing || Boolean(createdAnalysisId && step <= 2)}>Voltar</button>
          <div><span>Etapa {step + 1} de {steps.length}</span><button className="button primary" disabled={finishing} onClick={() => step < steps.length - 1 ? setStep((current) => current + 1) : void finishAnalysis()}>{finishing ? "Salvando…" : step === steps.length - 1 ? (databaseMode ? (createdAnalysisId ? "Tentar novamente" : "Criar análise") : "Validar demonstração") : "Continuar"}<Icon name="arrow" size={16} /></button></div>
        </footer>
      </section>
    </div>
  );
}
