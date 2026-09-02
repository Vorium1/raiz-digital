"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { LabImporter } from "@/components/lab-importer";
import type { LabImportPreview } from "@/domain/lab-import";

const steps = [
  { label: "Área e contexto", icon: "leaf" },
  { label: "Pontos e coleta", icon: "location" },
  { label: "Laudo laboratorial", icon: "upload" },
  { label: "Conferência", icon: "check" },
] as const;

type ContextData = {
  clients: Array<{ id: string; name: string }>;
  properties: Array<{ id: string; clientId: string; name: string; municipality: string; state: string }>;
  fields: Array<{ id: string; propertyId: string; name: string; areaHa: number }>;
  seasons: Array<{ id: string; fieldId: string; seasonLabel: string; currentCrop: string | null; nextCrop: string | null; yieldGoal: number | null; yieldGoalUnit: string | null }>;
  laboratories: Array<{ id: string; name: string; taxId: string | null }>;
};

const emptyContext: ContextData = { clients: [], properties: [], fields: [], seasons: [], laboratories: [] };

export function NewAnalysisFlow({ initialStep = 0, databaseMode = false }: { initialStep?: number; databaseMode?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 0), steps.length - 1));
  const [method, setMethod] = useState("Mehlich-1");
  const [importPreview, setImportPreview] = useState<LabImportPreview | null>(null);
  const [importFile, setImportFile] = useState<{fileName:string;content:string} | null>(null);
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

  async function createLaboratory() {
    const name = newLabName.trim();
    if (!name) return;
    setCreatingLab(true);
    setLabError("");
    try {
      const response = await fetch("/api/laboratories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível cadastrar o laboratório.");
      setContext((current) => ({ ...current, laboratories: [...current.laboratories, payload.laboratory].sort((a, b) => a.name.localeCompare(b.name)) }));
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
    void fetch("/api/context", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!alive) return;
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar clientes e talhões.");
      setContext(payload as ContextData);
      setContextLoading(false);
    }).catch((error) => {
      if (!alive) return;
      setContextError(error instanceof Error ? error.message : "Falha ao carregar contexto.");
      setContextLoading(false);
    });
    return () => { alive = false; };
  }, [databaseMode]);

  const properties = useMemo(() => context.properties.filter((item)=>item.clientId === clientId), [context.properties, clientId]);
  const fields = useMemo(() => context.fields.filter((item)=>item.propertyId === propertyId), [context.fields, propertyId]);
  const seasons = useMemo(() => context.seasons.filter((item)=>item.fieldId === fieldId), [context.seasons, fieldId]);
  const selectedClient = context.clients.find((item)=>item.id === clientId);
  const selectedProperty = context.properties.find((item)=>item.id === propertyId);
  const selectedField = context.fields.find((item)=>item.id === fieldId);
  const selectedSeason = context.seasons.find((item)=>item.id === seasonId);

  const importReady = Boolean(importPreview && importPreview.blockers === 0);
  const analysisOutcome = !importPreview ? "AWAITING_LAB" : importReady ? "IMPORTED" : "INCONSISTENT";
  const contextReady = databaseMode ? Boolean(clientId && propertyId && fieldId && seasonId) : true;

  function chooseClient(value: string) { setClientId(value); setPropertyId(""); setFieldId(""); setSeasonId(""); }
  function chooseProperty(value: string) { setPropertyId(value); setFieldId(""); setSeasonId(""); }
  function chooseField(value: string) { setFieldId(value); setSeasonId(""); }

  async function finishAnalysis() {
    setFinishError("");
    if (!databaseMode) {
      const messages = {
        AWAITING_LAB: "Análise demonstrativa criada como rascunho aguardando laudo.",
        IMPORTED: "Fluxo demonstrativo validado com laudo importado.",
        INCONSISTENT: "Fluxo demonstrativo detectou inconsistências e bloquearia a interpretação.",
      } as const;
      alert(messages[analysisOutcome]);
      return;
    }
    if (!contextReady) {
      setFinishError("Selecione cliente, propriedade, talhão e safra cadastrados antes de criar a análise.");
      setStep(0);
      return;
    }

    setFinishing(true);
    try {
      const analysisResponse = await fetch("/api/analyses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cropSeasonId: seasonId, laboratoryId: laboratoryId || undefined, sourceType: importFile ? "CSV" : null }),
      });
      const analysisPayload = await analysisResponse.json().catch(() => ({}));
      if (!analysisResponse.ok) throw new Error(analysisPayload.error ?? "Não foi possível criar a análise.");
      const analysisId = analysisPayload.analysis.id as string;

      if (importFile) {
        const commitResponse = await fetch("/api/import/commit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            analysisId,
            content: importFile.content,
            fileName: importFile.fileName,
            fallbackMethod: method || undefined,
            hasAgronomicContext: true,
            spatialLinked: false,
          }),
        });
        const commitPayload = await commitResponse.json().catch(() => ({}));
        if (!commitResponse.ok) throw new Error(commitPayload.error ?? "Análise criada, mas o laudo não pôde ser persistido.");
      }

      router.push(`/analises/${analysisId}`);
      router.refresh();
    } catch (error) {
      setFinishError(error instanceof Error ? error.message : "Não foi possível concluir o fluxo.");
    } finally {
      setFinishing(false);
    }
  }

  return <div className="wizard-shell">
    <ol className="stepper">{steps.map((item,index)=><li key={item.label} className={index === step ? "active" : index < step ? "done" : ""}><button type="button" onClick={()=>setStep(index)} aria-label={`Ir para ${item.label}`}><span>{index < step ? <Icon name="check" size={15}/> : index+1}</span><div><small>ETAPA {index+1}</small><strong>{item.label}</strong></div></button></li>)}</ol>
    <section className="card wizard-card">
      {step === 0 && <div className="form-section">
        <div className="form-heading"><span className="eyebrow">IDENTIFICAÇÃO</span><h2>Onde esta análise será realizada?</h2><p>{databaseMode ? "Selecione a estrutura já cadastrada. Estes IDs serão persistidos na análise real." : "Estes dados são demonstrativos e definem o contexto técnico da experiência."}</p></div>
        {databaseMode && contextLoading && <div className="import-message"><Icon name="clock"/><div><strong>Carregando estrutura agronômica…</strong><small>Clientes, propriedades, talhões e safras do tenant ativo.</small></div></div>}
        {databaseMode && contextError && <div className="import-message danger"><Icon name="warning"/><div><strong>Contexto indisponível</strong><small>{contextError}</small></div></div>}
        {databaseMode && !contextLoading && !context.clients.length && <div className="empty-context"><Icon name="users" size={24}/><div><strong>Nenhum cliente cadastrado.</strong><small>Cadastre o primeiro cliente em Clientes. Propriedades e talhões já possuem API persistente; a interface cartográfica será conectada na próxima evolução.</small></div></div>}
        <div className="form-grid">
          {databaseMode ? <>
            <label><span>Cliente *</span><select value={clientId} onChange={(e)=>chooseClient(e.target.value)}><option value="">Selecione o cliente</option>{context.clients.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label><span>Propriedade *</span><select value={propertyId} onChange={(e)=>chooseProperty(e.target.value)} disabled={!clientId}><option value="">Selecione a propriedade</option>{properties.map((item)=><option key={item.id} value={item.id}>{item.name} · {item.municipality}/{item.state}</option>)}</select></label>
            <label><span>Talhão *</span><select value={fieldId} onChange={(e)=>chooseField(e.target.value)} disabled={!propertyId}><option value="">Selecione o talhão</option>{fields.map((item)=><option key={item.id} value={item.id}>{item.name} · {Number(item.areaHa).toLocaleString("pt-BR",{maximumFractionDigits:2})} ha</option>)}</select></label>
            <label><span>Safra *</span><select value={seasonId} onChange={(e)=>setSeasonId(e.target.value)} disabled={!fieldId}><option value="">Selecione a safra</option>{seasons.map((item)=><option key={item.id} value={item.id}>{item.seasonLabel}</option>)}</select></label>
            <label><span>Cultura atual</span><input value={selectedSeason?.currentCrop ?? ""} readOnly placeholder="Definida na safra"/></label>
            <label><span>Próxima cultura</span><input value={selectedSeason?.nextCrop ?? ""} readOnly placeholder="Definida na safra"/></label>
            <label><span>Meta produtiva</span><input value={selectedSeason?.yieldGoal ? `${selectedSeason.yieldGoal} ${selectedSeason.yieldGoalUnit ?? ""}` : ""} readOnly placeholder="Não informada"/></label>
            <label><span>Área</span><input value={selectedField ? `${Number(selectedField.areaHa).toLocaleString("pt-BR",{maximumFractionDigits:2})} ha` : ""} readOnly/></label>
          </> : <>
            <label><span>Cliente *</span><select defaultValue="Fazenda Horizonte"><option>Fazenda Horizonte</option><option>Agropecuária Santa Clara</option></select></label>
            <label><span>Propriedade *</span><select defaultValue="Matriz"><option>Matriz</option></select></label>
            <label><span>Talhão *</span><select defaultValue="Talhão Norte · 42,8 ha"><option>Talhão Norte · 42,8 ha</option></select></label>
            <label><span>Safra *</span><select defaultValue="2026/27"><option>2026/27</option><option>2025/26</option></select></label>
            <label><span>Cultura atual *</span><select defaultValue="Soja"><option>Soja</option><option>Milho</option><option>Trigo</option></select></label>
            <label><span>Próxima cultura *</span><select defaultValue="Milho"><option>Milho</option><option>Soja</option><option>Trigo</option></select></label>
            <label><span>Profundidade *</span><select defaultValue="0–20 cm"><option>0–20 cm</option><option>20–40 cm</option></select></label>
            <label><span>Meta produtiva</span><div className="input-suffix"><input defaultValue="75" inputMode="decimal"/><b>sc/ha</b></div></label>
          </>}
        </div>
        {databaseMode && contextReady && <div className="form-note"><Icon name="shield" size={19}/><div><strong>Contexto persistente selecionado</strong><small>{selectedClient?.name} · {selectedProperty?.name} · {selectedField?.name} · {selectedSeason?.seasonLabel}</small></div></div>}
      </div>}
      {step === 1 && <div className="form-section">
        <div className="form-heading"><span className="eyebrow">GEOREFERENCIAMENTO</span><h2>Vincule os pontos de coleta.</h2><p>O banco já suporta ordens, pontos GPS e PostGIS. Nesta versão, a criação cartográfica continua separada do fluxo para não inventar coordenadas.</p></div>
        {databaseMode ? <div className="pending-engine"><Icon name="map" size={24}/><div><span className="eyebrow">POSTGIS PREPARADO</span><h3>Sem pontos fictícios no modo real.</h3><p>Se uma ordem de coleta real já estiver vinculada à safra ela poderá ser associada pela API. O editor de grid e GPS será conectado em seguida.</p></div></div> : <div className="choice-grid"><button className="choice-card selected"><div><Icon name="map"/></div><strong>Usar ordem de coleta</strong><small>OC-0261 · 24 pontos planejados</small><span><Icon name="check" size={14}/></span></button><button className="choice-card"><div><Icon name="upload"/></div><strong>Importar arquivo GPS</strong><small>CSV, GeoJSON, KML, KMZ ou GPX</small></button></div>}
      </div>}
      {step === 2 && <div className="form-section">
        <div className="form-heading"><span className="eyebrow">RESULTADOS</span><h2>Importe o laudo do laboratório.</h2><p>CSV ou XLSX são lidos e validados no servidor. No modo real, o mesmo conteúdo é revalidado no commit antes de entrar no PostgreSQL.</p></div>
        <div className="import-options"><div><Icon name="flask"/><span><strong>Laboratório</strong>{databaseMode ? <select value={laboratoryId} onChange={(event)=>setLaboratoryId(event.target.value)}><option value="">Não identificado</option>{context.laboratories.map((lab)=><option key={lab.id} value={lab.id}>{lab.name}</option>)}</select> : <select defaultValue=""><option value="">Identificar / selecionar</option><option>LabSolo</option><option>Outro laboratório</option></select>}</span></div><div><Icon name="layers"/><span><strong>Extrator principal P/K</strong><select value={method} onChange={(event)=>setMethod(event.target.value)}><option value="">Não informado</option><option>Mehlich-1</option><option>Resina</option><option>KCl 1 mol/L</option><option>Acetato de cálcio</option></select></span></div></div>
        {databaseMode && <div className="new-lab-inline"><input value={newLabName} onChange={(event)=>setNewLabName(event.target.value)} placeholder="Cadastrar novo laboratório pelo nome" disabled={creatingLab}/><button type="button" className="button secondary" disabled={creatingLab || !newLabName.trim()} onClick={()=>void createLaboratory()}>{creatingLab ? "Salvando…" : "Cadastrar"}</button></div>}
        {labError && <div className="import-message danger"><Icon name="warning"/><div><strong>Não foi possível cadastrar</strong><small>{labError}</small></div></div>}
        <LabImporter method={method} onPreviewChange={setImportPreview} onFileReady={setImportFile}/>
      </div>}
      {step === 3 && <div className="form-section">
        <div className="form-heading"><span className="eyebrow">PRÉ-VALIDAÇÃO</span><h2>Confira antes de processar.</h2><p>A interpretação só será liberada depois que entradas e contexto forem consistentes.</p></div>
        <div className="review-grid"><div className="review-summary"><span>Área</span><strong>{databaseMode ? selectedField?.name || "Não selecionada" : "Talhão Norte"}</strong><small>{databaseMode ? `${selectedClient?.name ?? "—"} · ${selectedField ? Number(selectedField.areaHa).toLocaleString("pt-BR",{maximumFractionDigits:2}) : "0"} ha` : "Fazenda Horizonte · 42,8 ha"}</small></div><div className="review-summary"><span>Contexto</span><strong>{databaseMode ? `${selectedSeason?.currentCrop ?? "—"} → ${selectedSeason?.nextCrop ?? "—"}` : "Soja → Milho"}</strong><small>{databaseMode ? selectedSeason?.seasonLabel ?? "Safra não selecionada" : "Safra 2026/27 · 0–20 cm"}</small></div><div className="review-summary"><span>Amostragem</span><strong>{databaseMode ? "Sem pontos simulados" : "24 pontos"}</strong><small>{databaseMode ? "Vinculação espacial entra quando houver ordem real" : "Grid 2,0 ha · WGS84"}</small></div><div className="review-summary"><span>Laudo</span><strong>{importPreview ? `${importPreview.sampleCount} amostras` : "Ainda não importado"}</strong><small>{importPreview ? `${importPreview.rows.length} resultados · confiança ${importPreview.confidence.score}/100` : "Pode ser anexado depois"}</small></div></div>
        <div className="validation-list">{databaseMode && !contextReady && <div className="attention danger"><Icon name="warning"/><span><strong>Contexto cadastral incompleto</strong><small>Cliente, propriedade, talhão e safra precisam existir no banco.</small></span><b>BLOQUEADO</b></div>}{contextReady && <div className="ok"><Icon name="check"/><span><strong>Contexto agronômico vinculado</strong><small>{databaseMode ? "IDs reais do tenant selecionados" : "Contexto demonstrativo preenchido"}</small></span><b>OK</b></div>}{!importPreview && <div className="attention"><Icon name="warning"/><span><strong>Laudo laboratorial pendente</strong><small>A análise será criada aguardando laboratório; nenhuma interpretação será executada.</small></span><b>PENDENTE</b></div>}{importPreview && importPreview.blockers === 0 && <div className="ok"><Icon name="check"/><span><strong>Laudo importado e normalizado</strong><small>{importPreview.parameterCount} parâmetros reconhecidos · {importPreview.warnings} itens para conferência</small></span><b>OK</b></div>}{importPreview && importPreview.blockers > 0 && <div className="attention danger"><Icon name="warning"/><span><strong>{importPreview.blockers} bloqueio(s) no laudo</strong><small>A análise será registrada como inconsistente e não poderá ser interpretada antes da correção.</small></span><b>BLOQUEADO</b></div>}</div>
        <div className="workflow-decision"><Icon name="shield" size={19}/><div><span>Estado inicial calculado</span><strong>{analysisOutcome}</strong><small>O status é definido pela qualidade das entradas, não por decisão da IA.</small></div></div>
        {finishError && <div className="import-message danger"><Icon name="warning"/><div><strong>Não foi possível concluir</strong><small>{finishError}</small></div></div>}
      </div>}
      <footer className="wizard-footer"><button className="button ghost" onClick={()=>setStep((current)=>Math.max(0,current-1))} disabled={step===0 || finishing}>Voltar</button><div><span>Etapa {step+1} de {steps.length}</span><button className="button primary" disabled={finishing} onClick={()=>step < steps.length-1 ? setStep((current)=>current+1) : void finishAnalysis()}>{finishing ? "Salvando…" : step === steps.length-1 ? (databaseMode ? "Criar análise real" : "Validar demonstração") : "Continuar"}<Icon name="arrow" size={16}/></button></div></footer>
    </section>
  </div>;
}
