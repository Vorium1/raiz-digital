"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { LabImporter, type LabImporterReadyFile } from "@/components/lab-importer";
import { SimpleAreaSetup } from "@/components/simple-area-setup";
import { buildAnalysisEvidence, EMPTY_ANALYSIS_CONTEXT_DRAFT, type AnalysisContextDraft } from "@/domain/analysis-context";
import { evaluateAnalysisDepthReadiness } from "@/domain/analysis-depth-readiness";
import type { AnalysisDepthId } from "@/domain/analysis-depths";
import type { LabImportPreview } from "@/domain/lab-import";

const ANALYSIS_DEPTH: AnalysisDepthId = "interpretacao-rapida";

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
    yieldGoal?: number | null;
    yieldGoalUnit?: string | null;
    irrigated?: boolean;
    managementSystem?: string | null;
    soilType?: string | null;
    soilTexture?: string | null;
  }>;
  laboratories: Array<{ id: string; name: string }>;
  cropProfiles: Array<{ id: string; code: string; name: string; status: string }>;
};

type ImportPreview = LabImportPreview & { normalizedRowCount?: number };
const emptyContext: ContextData = { clients: [], properties: [], fields: [], seasons: [], laboratories: [], cropProfiles: [] };


export function SimpleSendFlow() {
  const router = useRouter();
  const [context, setContext] = useState<ContextData>(emptyContext);
  const [contextLoading, setContextLoading] = useState(true);
  const [contextError, setContextError] = useState("");
  const [clientId, setClientId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [fieldId, setFieldId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [laboratoryId, setLaboratoryId] = useState("");
  const [method, setMethod] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [file, setFile] = useState<LabImporterReadyFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [areaConfirmed, setAreaConfirmed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void fetch("/api/context", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar suas áreas.");
        if (alive) { setContext(payload as ContextData); setContextLoading(false); }
      })
      .catch((caught) => {
        if (!alive) return;
        setContextError(caught instanceof Error ? caught.message : "Não foi possível carregar suas áreas.");
        setContextLoading(false);
      });
    return () => { alive = false; };
  }, []);

  const properties = useMemo(() => context.properties.filter((item) => item.clientId === clientId), [context.properties, clientId]);
  const fields = useMemo(() => context.fields.filter((item) => item.propertyId === propertyId), [context.fields, propertyId]);
  const seasons = useMemo(() => context.seasons.filter((item) => item.fieldId === fieldId), [context.seasons, fieldId]);
  const selectedClient = context.clients.find((item) => item.id === clientId);
  const selectedProperty = context.properties.find((item) => item.id === propertyId);
  const selectedField = context.fields.find((item) => item.id === fieldId);
  const selectedSeason = context.seasons.find((item) => item.id === seasonId);

  useEffect(() => {
    if (!clientId && context.clients.length === 1) setClientId(context.clients[0].id);
  }, [context.clients, clientId]);
  useEffect(() => {
    if (clientId && !propertyId && properties.length === 1) setPropertyId(properties[0].id);
  }, [clientId, propertyId, properties]);
  useEffect(() => {
    if (propertyId && !fieldId && fields.length === 1) setFieldId(fields[0].id);
  }, [propertyId, fieldId, fields]);
  useEffect(() => {
    if (fieldId && !seasonId && seasons.length === 1) setSeasonId(seasons[0].id);
  }, [fieldId, seasonId, seasons]);

  async function refreshContext() {
    const response = await fetch("/api/context", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? "Não foi possível atualizar suas áreas.");
    setContext(payload as ContextData);
    return payload as ContextData;
  }

  async function handleSetupCreated(kind: "client" | "property" | "field" | "season", id: string) {
    await refreshContext();
    if (kind === "client") {
      setClientId(id); setPropertyId(""); setFieldId(""); setSeasonId("");
    } else if (kind === "property") {
      setPropertyId(id); setFieldId(""); setSeasonId("");
    } else if (kind === "field") {
      setFieldId(id); setSeasonId("");
    } else {
      setSeasonId(id);
    }
  }

  useEffect(() => {
    setAreaConfirmed(false);
  }, [clientId, propertyId, fieldId, seasonId]);

  function chooseClient(value: string) { setClientId(value); setPropertyId(""); setFieldId(""); setSeasonId(""); }
  function chooseProperty(value: string) { setPropertyId(value); setFieldId(""); setSeasonId(""); }
  function chooseField(value: string) { setFieldId(value); setSeasonId(""); }

  const importReady = Boolean(preview && preview.blockers === 0 && file);
  const fileNeedsAttention = Boolean(preview && preview.blockers > 0);
  const areaReady = Boolean(clientId && propertyId && fieldId && seasonId);
  const rowCount = preview?.normalizedRowCount ?? preview?.rows.length ?? 0;

  const analysisContextDraft = useMemo<AnalysisContextDraft>(() => ({
    ...EMPTY_ANALYSIS_CONTEXT_DRAFT,
    waterRegime: selectedSeason ? (selectedSeason.irrigated ? "IRRIGADO" : "SEQUEIRO") : "",
    tillageSystem: selectedSeason?.managementSystem?.trim() || "",
    soilContextNotes: [selectedSeason?.soilType, selectedSeason?.soilTexture].filter(Boolean).join(" · "),
  }), [selectedSeason]);

  const evidence = useMemo(() => buildAnalysisEvidence(analysisContextDraft, {
    currentSoilAnalysis: importReady,
    crop: Boolean(selectedSeason?.nextCrop || selectedSeason?.currentCrop),
    yieldGoal: selectedSeason?.yieldGoal != null,
    yieldUnit: Boolean(selectedSeason?.yieldGoalUnit),
    fieldBoundaryGeoreferenced: Boolean(selectedField?.boundary),
    registeredSoilContext: Boolean(selectedSeason?.soilType || selectedSeason?.soilTexture),
  }), [analysisContextDraft, importReady, selectedField, selectedSeason]);

  const readiness = useMemo(() => evaluateAnalysisDepthReadiness(ANALYSIS_DEPTH, evidence), [evidence]);

  async function submit() {
    if (!file || !importReady || !areaReady || !areaConfirmed) return;
    setBusy(true);
    setError("");
    try {
      const analysisResponse = await fetch("/api/analyses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cropSeasonId: seasonId,
          laboratoryId: laboratoryId || undefined,
          sourceType: file.sourceType,
          analysisDepth: ANALYSIS_DEPTH,
          analysisContext: {
            schemaVersion: 1,
            ux: "ZERO_TRAINING",
            sourceFileName: file.originalFileName,
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
      if (!analysisResponse.ok) throw new Error(analysisPayload.error ?? "Não foi possível iniciar a análise.");
      const analysisId = analysisPayload.analysis.id as string;

      const commitResponse = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          analysisId,
          content: file.content,
          fileName: file.fileName,
          fallbackMethod: method || undefined,
          hasAgronomicContext: readiness.effectiveLayer >= 2,
          spatialLinked: false,
        }),
      });
      const commitPayload = await commitResponse.json().catch(() => ({}));
      if (!commitResponse.ok) throw new Error(commitPayload.error ?? "O arquivo não pôde ser salvo.");

      const interpretationResponse = await fetch(`/api/analyses/${analysisId}/interpret`, { method: "POST" });
      const interpretationPayload = await interpretationResponse.json().catch(() => ({}));
      if (!interpretationResponse.ok && interpretationPayload.error) {
        sessionStorage.setItem(`raiz:ux3:auto:${analysisId}`, String(interpretationPayload.error));
      }

      router.push(`/analise/${analysisId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível enviar estes dados.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="simple-send-flow">
      <section className="simple-send-block">
        <div className="simple-send-number">1</div>
        <div className="simple-send-content">
          <div className="simple-send-heading"><span>ARQUIVO</span><h2>Envie o que você recebeu</h2><p>Laudo, planilha, PDF ou foto. A RAIZ lê e organiza.</p></div>
          <LabImporter simple method={method} onPreviewChange={(value) => setPreview(value as ImportPreview | null)} onFileReady={setFile}/>
          {importReady && <div className="simple-send-ok"><Icon name="check" size={18}/><div><strong>Arquivo recebido</strong><small>{file?.fileName} · {rowCount} resultado(s) reconhecido(s)</small></div></div>}
          <details className="simple-send-options"><summary>Opções do arquivo</summary><div><label>Laboratório<select value={laboratoryId} onChange={(event) => setLaboratoryId(event.target.value)}><option value="">Não preciso informar agora</option>{context.laboratories.map((lab) => <option key={lab.id} value={lab.id}>{lab.name}</option>)}</select></label><label>Método, somente se estiver faltando no arquivo<select value={method} onChange={(event) => setMethod(event.target.value)}><option value="">Não assumir</option><option>Mehlich-1</option><option>Resina</option><option>KCl 1 mol/L</option><option>Acetato de cálcio</option></select></label></div></details>
        </div>
      </section>

      <section className={`simple-send-block ${importReady ? "available" : "locked"}`}>
        <div className="simple-send-number">2</div>
        <div className="simple-send-content">
          <div className="simple-send-heading"><span>ÁREA</span><h2>De onde são estes dados?</h2><p>Confirme a área. Só isso.</p></div>
          {!importReady ? <div className="simple-send-wait"><Icon name={fileNeedsAttention ? "warning" : "upload"} size={18}/>{fileNeedsAttention ? "Confira o aviso do arquivo acima antes de continuar." : "Primeiro envie o arquivo acima."}</div> : contextLoading ? <div className="simple-send-wait"><Icon name="clock" size={18}/> Carregando suas áreas…</div> : contextError ? <div className="simple-send-error">{contextError}</div> : (
            <div className="simple-area-picker">
              {context.clients.length > 1 && <label><span>Cliente</span><select value={clientId} onChange={(event) => chooseClient(event.target.value)}><option value="">Escolha</option>{context.clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
              {clientId && properties.length > 1 && <label><span>Fazenda</span><select value={propertyId} onChange={(event) => chooseProperty(event.target.value)}><option value="">Escolha</option>{properties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
              {propertyId && fields.length > 1 && <label><span>Talhão</span><select value={fieldId} onChange={(event) => chooseField(event.target.value)}><option value="">Escolha</option>{fields.map((item) => <option key={item.id} value={item.id}>{item.name} · {Number(item.areaHa).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</option>)}</select></label>}
              {fieldId && seasons.length > 1 && <label><span>Safra</span><select value={seasonId} onChange={(event) => setSeasonId(event.target.value)}><option value="">Escolha</option>{seasons.map((item) => <option key={item.id} value={item.id}>{item.seasonLabel}</option>)}</select></label>}

              <SimpleAreaSetup
                clients={context.clients}
                properties={properties}
                fields={fields}
                seasons={seasons}
                cropProfiles={context.cropProfiles}
                clientId={clientId}
                propertyId={propertyId}
                fieldId={fieldId}
                onCreated={handleSetupCreated}
              />

              {areaReady && (
                <div className={`simple-area-confirmed ${areaConfirmed ? "confirmed" : "pending"}`}>
                  <Icon name={areaConfirmed ? "check" : "location"} size={18}/>
                  <div>
                    <strong>{selectedField?.name}</strong>
                    <small>{selectedClient?.name} · {selectedProperty?.name} · Safra {selectedSeason?.seasonLabel}{(selectedSeason?.currentCrop || selectedSeason?.nextCrop) ? ` · ${selectedSeason.currentCrop || selectedSeason.nextCrop}` : ""}</small>
                  </div>
                  {!areaConfirmed
                    ? <button type="button" onClick={() => setAreaConfirmed(true)}>Usar esta área</button>
                    : <span className="simple-area-confirmed-label">Confirmada</span>}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {error && <div className="simple-send-error final"><Icon name="warning" size={17}/><span>{error}</span></div>}

      <div className="simple-send-finish">
        <div><strong>A RAIZ faz o restante.</strong><small>Organiza, analisa e leva para revisão. Nada é publicado automaticamente.</small></div>
        <button type="button" disabled={!importReady || !areaReady || !areaConfirmed || busy} onClick={() => void submit()}>{busy ? "Analisando…" : "Enviar e analisar"}<Icon name="arrow" size={16}/></button>
      </div>
    </div>
  );
}
