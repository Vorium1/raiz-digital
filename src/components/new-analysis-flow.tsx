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
  { label: "Enviar dados", icon: "upload" },
  { label: "Vincular área", icon: "map" },
  { label: "Completar contexto", icon: "location" },
  { label: "Processar", icon: "sparkles" },
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
  const [method, setMethod] = useState("");
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
    return () => { alive = false; };
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

  const importReady = Boolean(importPreview && importPreview.blockers === 0 && importFile);
  const totalImportRows = importPreview?.normalizedRowCount ?? importPreview?.rows.length ?? 0;
  const analysisOutcome = !importPreview ? "AWAITING_LAB" : importReady ? "IMPORTED" : "INCONSISTENT";
  const contextReady = databaseMode ? Boolean(clientId && propertyId && fieldId && seasonId) : true;
  const cropAvailable = databaseMode ? Boolean(selectedSeason?.nextCrop || selectedSeason?.currentCrop) : true;
  const yieldGoalAvailable = databaseMode ? selectedSeason?.yieldGoal != null : true;
  const yieldUnitAvailable = databaseMode ? Boolean(selectedSeason?.yieldGoalUnit) : true;
  const fieldBoundaryGeoreferenced = databaseMode ? Boolean(selectedField?.boundary) : false;

  const evidence = useMemo(
    () => buildAnalysisEvidence(analysisContextDraft, {
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

  async function finishAnalysis() {
    setFinishError("");

    if (!importReady || !importFile) {
      setFinishError("Envie um laudo válido antes de processar.");
      setStep(0);
      return;
    }
    if (!contextReady) {
      setFinishError("Vincule cliente, propriedade, talhão e safra antes de processar.");
      setStep(1);
      return;
    }

    if (!databaseMode) {
      alert(`Fluxo UX 2.0 validado. A RAIZ processaria ${totalImportRows} resultado(s) e prepararia o diagnóstico para revisão.`);
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
            sourceType: importSourceType(importFile.fileName),
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

      const commitResponse = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          analysisId,
          content: importFile.content,
          fileName: importFile.fileName,
          fallbackMethod: method || undefined,
          hasAgronomicContext: readiness.effectiveLayer >= 2,
          spatialLinked: false,
        }),
      });
      const commitPayload = await commitResponse.json().catch(() => ({}));
      if (!commitResponse.ok) throw new Error(commitPayload.error ?? "A análise foi criada, mas o laudo não pôde ser persistido.");

      // UX 2.0: após persistir o dado, a RAIZ tenta executar o motor determinístico sem exigir outro clique.
      // Se a evidência ainda for insuficiente, o motor falha fechado e a análise continua disponível para
      // completar contexto; nenhuma recomendação oficial é publicada automaticamente.
      const interpretationResponse = await fetch(`/api/analyses/${analysisId}/interpret`, { method: "POST" });
      const interpretationPayload = await interpretationResponse.json().catch(() => ({}));
      const autoState = interpretationResponse.ok ? "review" : "needs-context";

      if (!interpretationResponse.ok && interpretationPayload.error) {
        sessionStorage.setItem(`raiz:ux2:auto:${analysisId}`, String(interpretationPayload.error));
      }

      router.push(`/analises/${analysisId}?ux2=${autoState}`);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível concluir o fluxo.";
      setFinishError(analysisId ? `${message} O registro criado será reutilizado na próxima tentativa; nenhum vínculo cadastral será trocado silenciosamente.` : message);
      setStep(3);
    } finally {
      setFinishing(false);
    }
  }

  const nextDisabled = finishing
    || (step === 0 && !importReady)
    || (step === 1 && !contextReady);

  return (
    <div className="wizard-shell ux2-wizard-shell">
      <ol className="stepper ux2-stepper">
        {steps.map((item, index) => (
          <li key={item.label} className={index === step ? "active" : index < step ? "done" : ""}>
            <button
              type="button"
              disabled={Boolean(createdAnalysisId) && (index === 1 || index === 2)}
              onClick={() => setStep(index)}
              aria-label={`Ir para ${item.label}`}
            >
              <span>{index < step ? <Icon name="check" size={15} /> : index + 1}</span>
              <div><small>ETAPA {index + 1}</small><strong>{item.label}</strong></div>
            </button>
          </li>
        ))}
      </ol>

      <section className="card wizard-card ux2-wizard-card">
        {step === 0 && (
          <div className="form-section">
            <div className="form-heading">
              <span className="eyebrow">RECEBER DADOS</span>
              <h2>Envie o laudo primeiro.</h2>
              <p>Você não precisa montar o diagnóstico antes de começar. A RAIZ lê o arquivo, valida o que recebeu e só depois pede o contexto que realmente faltar.</p>
            </div>
            <div className="ux2-source-strip">
              <span className="ready"><Icon name="upload" size={14}/>CSV / XLSX</span>
              <span><Icon name="file" size={14}/>PDF · conector em evolução</span>
              <span><Icon name="map" size={14}/>GPS / shapefile · fluxo espacial separado</span>
            </div>
            <div className="import-options">
              <div><Icon name="flask" /><span><strong>Laboratório</strong>{databaseMode ? <select value={laboratoryId} onChange={(event) => !createdAnalysisId && setLaboratoryId(event.target.value)} disabled={Boolean(createdAnalysisId) || contextLoading}><option value="">Identificar depois</option>{context.laboratories.map((lab) => <option key={lab.id} value={lab.id}>{lab.name}</option>)}</select> : <select defaultValue=""><option value="">Identificar depois</option><option>LabSolo</option></select>}</span></div>
              <div><Icon name="layers" /><span><strong>Método P/K, se não vier no arquivo</strong><select value={method} onChange={(event) => setMethod(event.target.value)}><option value="">Não assumir</option><option>Mehlich-1</option><option>Resina</option><option>KCl 1 mol/L</option><option>Acetato de cálcio</option></select></span></div>
            </div>
            {databaseMode && !createdAnalysisId && (
              <div className="new-lab-inline">
                <input value={newLabName} onChange={(event) => setNewLabName(event.target.value)} placeholder="Cadastrar laboratório pelo nome" disabled={creatingLab} />
                <button type="button" className="button secondary" disabled={creatingLab || !newLabName.trim()} onClick={() => void createLaboratory()}>{creatingLab ? "Salvando…" : "Cadastrar"}</button>
              </div>
            )}
            {labError && <div className="import-message danger"><Icon name="warning" /><div><strong>Não foi possível cadastrar</strong><small>{labError}</small></div></div>}
            <LabImporter method={method} onPreviewChange={setImportPreview} onFileReady={setImportFile} />
            {importReady && <div className="import-message review"><Icon name="check" /><div><strong>Dado recebido e validado</strong><small>{importPreview?.sampleCount ?? 0} amostra(s) · {totalImportRows} resultado(s). Agora vincule a área.</small></div></div>}
          </div>
        )}

        {step === 1 && (
          <div className="form-section">
            <div className="form-heading">
              <span className="eyebrow">VINCULAR CONTEXTO</span>
              <h2>Onde estes dados pertencem?</h2>
              <p>A RAIZ reaproveita os cadastros existentes. Nesta etapa você apenas confirma cliente, propriedade, talhão e safra.</p>
            </div>
            {databaseMode && contextLoading && <div className="import-message"><Icon name="clock" /><div><strong>Carregando estrutura agronômica…</strong><small>Clientes, propriedades, talhões e safras do tenant ativo.</small></div></div>}
            {databaseMode && contextError && <div className="import-message danger"><Icon name="warning" /><div><strong>Contexto indisponível</strong><small>{contextError}</small></div></div>}
            {databaseMode && !contextLoading && !context.clients.length && <div className="empty-context"><Icon name="users" size={24} /><div><strong>Nenhum cliente cadastrado.</strong><small>Cadastre o primeiro cliente para vincular o material recebido.</small></div></div>}
            <div className="form-grid">
              {databaseMode ? (
                <>
                  <label><span>Cliente *</span><select value={clientId} onChange={(event) => chooseClient(event.target.value)} disabled={Boolean(createdAnalysisId)}><option value="">Selecione</option>{context.clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <label><span>Propriedade *</span><select value={propertyId} onChange={(event) => chooseProperty(event.target.value)} disabled={!clientId || Boolean(createdAnalysisId)}><option value="">Selecione</option>{properties.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.municipality}/{item.state}</option>)}</select></label>
                  <label><span>Talhão *</span><select value={fieldId} onChange={(event) => chooseField(event.target.value)} disabled={!propertyId || Boolean(createdAnalysisId)}><option value="">Selecione</option>{fields.map((item) => <option key={item.id} value={item.id}>{item.name} · {Number(item.areaHa).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</option>)}</select></label>
                  <label><span>Safra *</span><select value={seasonId} onChange={(event) => !createdAnalysisId && setSeasonId(event.target.value)} disabled={!fieldId || Boolean(createdAnalysisId)}><option value="">Selecione</option>{seasons.map((item) => <option key={item.id} value={item.id}>{item.seasonLabel}</option>)}</select></label>
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
            {databaseMode && contextReady && <div className="form-note"><Icon name="shield" size={19} /><div><strong>Vínculo confirmado</strong><small>{selectedClient?.name} · {selectedProperty?.name} · {selectedField?.name} · {selectedSeason?.seasonLabel}</small></div></div>}
          </div>
        )}

        {step === 2 && (
          <div className="ux2-context-step">
            <div className="ux2-context-heading">
              <span className="eyebrow">SÓ O QUE FALTAR</span>
              <h2>Complete o contexto necessário.</h2>
              <p>O motor continua fail-closed: ausência de evidência vira pendência explícita, nunca valor inventado.</p>
            </div>
            <AnalysisContextIntake depthId={analysisDepthId} value={analysisContextDraft} onChange={setAnalysisContextDraft} />
          </div>
        )}

        {step === 3 && (
          <div className="form-section">
            <div className="form-heading">
              <span className="eyebrow">PROCESSAMENTO AUTOMÁTICO</span>
              <h2>A RAIZ já tem o necessário para começar.</h2>
              <p>Ao continuar, o arquivo é persistido, normalizado e o motor determinístico é executado automaticamente. O resultado segue para revisão; nada é publicado para o cliente sem os gates técnicos exigidos.</p>
            </div>
            <div className="review-grid">
              <div className="review-summary"><span>Arquivo</span><strong>{importFile?.fileName ?? "—"}</strong><small>{importPreview ? `${totalImportRows} resultado(s) reconhecidos` : "Sem prévia"}</small></div>
              <div className="review-summary"><span>Área</span><strong>{databaseMode ? selectedField?.name || "Não selecionada" : "Talhão Norte"}</strong><small>{databaseMode ? `${selectedClient?.name ?? "—"} · ${selectedField ? Number(selectedField.areaHa).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "0"} ha` : "Fazenda Horizonte · 42,8 ha"}</small></div>
              <div className="review-summary"><span>Diagnóstico possível</span><strong>{readiness.effectiveLayer}/4</strong><small>{readiness.completeForRequestedDepth ? "Dados mínimos presentes" : `${levelMissing.length} pendência(s) de contexto`}</small></div>
              <div className="review-summary"><span>Estado do laudo</span><strong>{analysisOutcome}</strong><small>{importPreview ? `Confiança ${importPreview.confidence.score}/100` : "Aguardando arquivo"}</small></div>
            </div>

            <div className="validation-list">
              {contextReady && <div className="ok"><Icon name="check" /><span><strong>Contexto cadastral vinculado</strong><small>Cliente, propriedade, talhão e safra definidos.</small></span><b>OK</b></div>}
              {importPreview && importPreview.blockers === 0 && <div className="ok"><Icon name="check" /><span><strong>Laudo pronto para persistência</strong><small>{importPreview.parameterCount} parâmetros reconhecidos · {importPreview.warnings} aviso(s)</small></span><b>OK</b></div>}
              {levelMissing.length > 0 && <div className="attention"><Icon name="warning" /><span><strong>Diagnóstico limitado pela evidência disponível</strong><small>{levelMissing.map((item) => item.label).join(" · ")}</small></span><b>{levelMissing.length} PENDÊNCIA(S)</b></div>}
              {spatialMissing.length > 0 && <div className="attention"><Icon name="map" /><span><strong>Camada espacial não completa</strong><small>{spatialMissing.map((item) => item.label).join(" · ")}. A interpretação química suportada pode prosseguir.</small></span><b>ESPACIAL</b></div>}
              {readiness.limitations.length > 0 && <div className="attention"><Icon name="shield" /><span><strong>Limitações rastreadas</strong><small>{readiness.limitations.join(" · ")}</small></span><b>REGISTRADO</b></div>}
            </div>

            <div className="ux2-auto-pipeline">
              <div><Icon name="upload" size={18}/><span><strong>1. Persistir</strong><small>Arquivo e hash da origem</small></span></div>
              <Icon name="arrow" size={14}/>
              <div><Icon name="flask" size={18}/><span><strong>2. Analisar</strong><small>Motor determinístico</small></span></div>
              <Icon name="arrow" size={14}/>
              <div><Icon name="shield" size={18}/><span><strong>3. Revisar</strong><small>Responsabilidade técnica</small></span></div>
            </div>

            {createdAnalysisId && <div className="import-message review"><Icon name="shield" /><div><strong>Análise já criada</strong><small>Uma nova tentativa reutiliza este registro; o vínculo cadastral não muda silenciosamente.</small></div></div>}
            {finishError && <div className="import-message danger"><Icon name="warning" /><div><strong>Não foi possível concluir</strong><small>{finishError}</small></div></div>}
          </div>
        )}

        <footer className="wizard-footer ux2-wizard-footer">
          <button className="button ghost" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0 || finishing || Boolean(createdAnalysisId && step <= 2)}>Voltar</button>
          <div>
            <span>Etapa {step + 1} de {steps.length}</span>
            <button
              className="button primary"
              disabled={nextDisabled}
              onClick={() => step < steps.length - 1 ? setStep((current) => current + 1) : void finishAnalysis()}
            >
              {finishing ? "Processando…" : step === steps.length - 1 ? (databaseMode ? "Processar dados" : "Validar demonstração") : step === 0 ? "Vincular área" : "Continuar"}
              <Icon name="arrow" size={16} />
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
