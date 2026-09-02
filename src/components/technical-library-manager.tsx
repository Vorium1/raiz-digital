"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/ui";

type CropProfile = { id: string; code: string; name: string; semanticVersion: string; status: "DRAFT" | "ACTIVE" | "SUPERSEDED"; cropGroup: string | null; technicalNotes: string | null };
type CropProfileParameter = {
  id: string; parameterCode: string; parameterCategory: string; depthFromCm: number | null; depthToCm: number | null;
  analyticalMethodAllowed: string[]; unitExpected: string | null; sufficiencyRanges: Array<{ label: string; min?: number; max?: number }> | null;
  criticality: string | null; status: "DRAFT" | "ACTIVE" | "SUPERSEDED";
};
type TechnicalRegion = { id: string; code: string; name: string; description: string | null };
type RuleSet = { id: string; code: string; semanticVersion: string; regionCode: string; supportedCrops: string[]; status: string };
type TechnicalSource = {
  id: string; title: string; institution: string | null; editionYear: number | null; cropProfileName: string | null;
  subject: string | null; status: "DRAFT" | "ACTIVE" | "SUPERSEDED";
};

const STATUS_TONE: Record<string, "success" | "review" | "waiting"> = { ACTIVE: "success", DRAFT: "waiting", SUPERSEDED: "review" };
const CROP_GROUP_LABEL: Record<string, string> = { VERAO: "Culturas de verão", INVERNO: "Culturas de inverno" };

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? "Operação não concluída.");
  return payload;
}
async function patchJson(url: string, body: unknown) {
  const response = await fetch(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? "Operação não concluída.");
  return payload;
}

export function TechnicalLibraryManager({ referenceUnits }: { referenceUnits: Record<string, string> }) {
  const [profiles, setProfiles] = useState<CropProfile[]>([]);
  const [regions, setRegions] = useState<TechnicalRegion[]>([]);
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [parameters, setParameters] = useState<CropProfileParameter[]>([]);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState("");

  const [newCropCode, setNewCropCode] = useState("");
  const [newCropName, setNewCropName] = useState("");
  const [newCropGroup, setNewCropGroup] = useState<"" | "VERAO" | "INVERNO">("");
  const [newRegionCode, setNewRegionCode] = useState("");
  const [newRegionName, setNewRegionName] = useState("");
  const [sources, setSources] = useState<TechnicalSource[]>([]);
  const [newSourceTitle, setNewSourceTitle] = useState("");
  const [newSourceInstitution, setNewSourceInstitution] = useState("");
  const [newSourceCropProfileId, setNewSourceCropProfileId] = useState("");
  const [newSourceSubject, setNewSourceSubject] = useState("");

  const [paramCode, setParamCode] = useState("");
  const [paramCategory, setParamCategory] = useState<"QUIMICO" | "FISICO" | "MICROBIOLOGICO">("QUIMICO");
  const [paramDepthFrom, setParamDepthFrom] = useState("0");
  const [paramDepthTo, setParamDepthTo] = useState("20");
  const [paramMethods, setParamMethods] = useState("");
  const [paramUnit, setParamUnit] = useState("");
  const [paramRangesText, setParamRangesText] = useState('[{"label":"Muito baixo","max":5},{"label":"Baixo","min":5,"max":5.5},{"label":"Adequado","min":5.5,"max":6.2},{"label":"Alto","min":6.2,"max":7},{"label":"Muito alto","min":7}]');
  const [paramCriticality, setParamCriticality] = useState<"" | "BAIXA" | "MEDIA" | "ALTA">("");

  async function loadAll() {
    const [profilesRes, regionsRes, ruleSetsRes, sourcesRes] = await Promise.all([
      fetch("/api/crop-profiles").then((r) => r.json()),
      fetch("/api/technical-regions").then((r) => r.json()),
      fetch("/api/rule-sets").then((r) => r.json()),
      fetch("/api/technical-sources").then((r) => r.json()),
    ]);
    setProfiles(profilesRes.cropProfiles ?? []);
    setRegions(regionsRes.technicalRegions ?? []);
    setRuleSets(ruleSetsRes.ruleSets ?? []);
    setSources(sourcesRes.technicalSources ?? []);
  }

  useEffect(() => { void loadAll(); }, []);

  async function loadParameters(profileId: string) {
    if (!profileId) { setParameters([]); return; }
    const response = await fetch(`/api/crop-profiles/${profileId}`).then((r) => r.json());
    setParameters(response.cropProfile?.parameters ?? []);
  }

  useEffect(() => { void loadParameters(selectedProfileId); }, [selectedProfileId]);

  async function createCrop() {
    setBusy("crop"); setMessage(null);
    try {
      await postJson("/api/crop-profiles", { code: newCropCode, name: newCropName, cropGroup: newCropGroup || null });
      setNewCropCode(""); setNewCropName(""); setNewCropGroup("");
      setMessage({ tone: "success", text: "Cultura cadastrada como DRAFT — sem faixa técnica ainda." });
      await loadAll();
    } catch (error) { setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao cadastrar cultura." }); }
    finally { setBusy(""); }
  }

  async function createSource() {
    setBusy("source"); setMessage(null);
    try {
      await postJson("/api/technical-sources", { title: newSourceTitle, institution: newSourceInstitution, cropProfileId: newSourceCropProfileId || null, subject: newSourceSubject });
      setNewSourceTitle(""); setNewSourceInstitution(""); setNewSourceCropProfileId(""); setNewSourceSubject("");
      setMessage({ tone: "success", text: "Fonte técnica cadastrada como DRAFT — homologue para a IA poder citá-la." });
      await loadAll();
    } catch (error) { setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao cadastrar fonte técnica." }); }
    finally { setBusy(""); }
  }

  async function toggleSourceStatus(source: TechnicalSource) {
    const nextStatus = source.status === "ACTIVE" ? "DRAFT" : "ACTIVE";
    setBusy(`source-status-${source.id}`); setMessage(null);
    try {
      await patchJson(`/api/technical-sources/${source.id}/status`, { status: nextStatus });
      setMessage({ tone: "success", text: nextStatus === "ACTIVE" ? `"${source.title}" homologada.` : `"${source.title}" voltou para DRAFT.` });
      await loadAll();
    } catch (error) { setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao atualizar fonte técnica." }); }
    finally { setBusy(""); }
  }

  async function toggleCropStatus(profile: CropProfile) {
    const nextStatus = profile.status === "ACTIVE" ? "DRAFT" : "ACTIVE";
    setBusy(`crop-status-${profile.id}`); setMessage(null);
    try {
      await patchJson(`/api/crop-profiles/${profile.id}/status`, { status: nextStatus });
      setMessage({ tone: "success", text: `Perfil ${profile.name} agora está ${nextStatus === "ACTIVE" ? "homologado (ACTIVE)" : "em DRAFT"}.` });
      await loadAll();
    } catch (error) { setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao atualizar status." }); }
    finally { setBusy(""); }
  }

  async function createRegion() {
    setBusy("region"); setMessage(null);
    try {
      await postJson("/api/technical-regions", { code: newRegionCode, name: newRegionName });
      setNewRegionCode(""); setNewRegionName("");
      setMessage({ tone: "success", text: "Região técnica cadastrada." });
      await loadAll();
    } catch (error) { setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao cadastrar região." }); }
    finally { setBusy(""); }
  }

  async function saveParameter() {
    if (!selectedProfileId) return;
    setBusy("param"); setMessage(null);
    try {
      let sufficiencyRanges = null;
      if (paramRangesText.trim()) {
        try { sufficiencyRanges = JSON.parse(paramRangesText); } catch { throw new Error("Faixas de suficiência precisam ser um JSON válido."); }
      }
      await postJson(`/api/crop-profiles/${selectedProfileId}/parameters`, {
        parameterCode: paramCode, parameterCategory: paramCategory,
        depthFromCm: paramDepthFrom ? Number(paramDepthFrom) : null, depthToCm: paramDepthTo ? Number(paramDepthTo) : null,
        analyticalMethodAllowed: paramMethods.split(",").map((m) => m.trim()).filter(Boolean),
        unitExpected: paramUnit, sufficiencyRanges, criticality: paramCriticality || null,
      });
      setParamCode(""); setParamMethods(""); setParamUnit(""); setParamCriticality("");
      setMessage({ tone: "success", text: "Parâmetro salvo como DRAFT — homologue para o motor passar a usá-lo." });
      await loadParameters(selectedProfileId);
    } catch (error) { setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao salvar parâmetro." }); }
    finally { setBusy(""); }
  }

  async function toggleParameterStatus(parameter: CropProfileParameter) {
    const nextStatus = parameter.status === "ACTIVE" ? "DRAFT" : "ACTIVE";
    setBusy(`param-status-${parameter.id}`); setMessage(null);
    try {
      await patchJson(`/api/crop-profile-parameters/${parameter.id}/status`, { status: nextStatus });
      setMessage({ tone: "success", text: nextStatus === "ACTIVE" ? `${parameter.parameterCode} homologado — já pode ser usado pelo motor.` : `${parameter.parameterCode} voltou para DRAFT.` });
      await loadParameters(selectedProfileId);
    } catch (error) { setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao atualizar parâmetro." }); }
    finally { setBusy(""); }
  }

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId) ?? null;

  return (
    <div className="field-ops-stack">
      {message && <div className={`field-ops-message ${message.tone}`}><Icon name={message.tone === "success" ? "check" : "warning"} size={17}/><span>{message.text}</span></div>}

      <details open><summary><span><b>1</b><strong>Culturas</strong><small>Catálogo versionado, extensível — sem lógica fixa por cultura</small></span><Icon name="chevron" size={16}/></summary>
        <div className="field-ops-form">
          <label><span>Código</span><input value={newCropCode} onChange={(e) => setNewCropCode(e.target.value)} placeholder="AVEIA"/></label>
          <label><span>Nome</span><input value={newCropName} onChange={(e) => setNewCropName(e.target.value)} placeholder="Aveia"/></label>
          <label><span>Grupo (organizacional)</span><select value={newCropGroup} onChange={(e) => setNewCropGroup(e.target.value as typeof newCropGroup)}><option value="">Não definido</option><option value="VERAO">Culturas de verão</option><option value="INVERNO">Culturas de inverno</option></select></label>
          <div className="field-ops-wide form-submit"><button className="button secondary" disabled={busy === "crop" || !newCropCode || !newCropName} onClick={() => void createCrop()}>{busy === "crop" ? "Salvando…" : "Cadastrar cultura"}</button></div>
          <div className="field-ops-wide field-ops-list">
            {(["VERAO", "INVERNO", ""] as const).map((group) => {
              const groupProfiles = profiles.filter((p) => (p.cropGroup ?? "") === group);
              if (!groupProfiles.length) return null;
              return (
                <div key={group || "sem-grupo"}>
                  <div className="eyebrow" style={{ padding: "10px 22px 4px", display: "block" }}>{group ? CROP_GROUP_LABEL[group] : "Sem grupo definido"}</div>
                  {groupProfiles.map((profile) => (
                    <div key={profile.id} className="field-ops-list-row">
                      <span onClick={() => setSelectedProfileId(profile.id)} style={{ cursor: "pointer" }}><strong>{profile.name}</strong><small>{profile.code} · v{profile.semanticVersion}</small></span>
                      <span className="field-ops-list-actions">
                        <StatusBadge tone={STATUS_TONE[profile.status]}>{profile.status}</StatusBadge>
                        <button className="button tiny" disabled={busy === `crop-status-${profile.id}`} onClick={() => void toggleCropStatus(profile)}>{profile.status === "ACTIVE" ? "Reverter" : "Homologar"}</button>
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </details>

      <details open={Boolean(selectedProfileId)}><summary><span><b>2</b><strong>Parâmetros do perfil selecionado</strong><small>{selectedProfile ? selectedProfile.name : "Selecione uma cultura acima"}</small></span><Icon name="chevron" size={16}/></summary>
        {selectedProfileId ? (
          <div className="field-ops-form">
            <label><span>Parâmetro</span><input value={paramCode} onChange={(e) => setParamCode(e.target.value)} placeholder="PH"/></label>
            <label><span>Categoria</span><select value={paramCategory} onChange={(e) => setParamCategory(e.target.value as typeof paramCategory)}><option value="QUIMICO">Químico</option><option value="FISICO">Físico</option><option value="MICROBIOLOGICO">Microbiológico</option></select></label>
            <label><span>Profundidade de (cm)</span><input value={paramDepthFrom} onChange={(e) => setParamDepthFrom(e.target.value)} inputMode="decimal"/></label>
            <label><span>Profundidade até (cm)</span><input value={paramDepthTo} onChange={(e) => setParamDepthTo(e.target.value)} inputMode="decimal"/></label>
            <label><span>Métodos aceitos (separados por vírgula)</span><input value={paramMethods} onChange={(e) => setParamMethods(e.target.value)} placeholder="CaCl2, SMP"/></label>
            <label><span>Unidade esperada</span><input value={paramUnit} onChange={(e) => setParamUnit(e.target.value)} placeholder="índice"/></label>
            <label><span>Criticidade</span><select value={paramCriticality} onChange={(e) => setParamCriticality(e.target.value as typeof paramCriticality)}><option value="">Não definida</option><option value="BAIXA">Baixa</option><option value="MEDIA">Média</option><option value="ALTA">Alta</option></select></label>
            <label className="field-ops-wide"><span>Faixas de suficiência (JSON, ordenadas do menor para o maior — deixe vazio para "aguardando homologação")</span><textarea value={paramRangesText} onChange={(e) => setParamRangesText(e.target.value)} rows={3}/></label>
            <div className="field-ops-wide form-submit"><button className="button secondary" disabled={busy === "param" || !paramCode} onClick={() => void saveParameter()}>{busy === "param" ? "Salvando…" : "Salvar parâmetro"}</button></div>
            <div className="field-ops-wide field-ops-list">
              {parameters.map((parameter) => (
                <div key={parameter.id} className="field-ops-list-row">
                  <span><strong>{parameter.parameterCode}</strong><small>{parameter.parameterCategory} · {parameter.depthFromCm ?? "?"}-{parameter.depthToCm ?? "?"}cm · {parameter.sufficiencyRanges ? `${parameter.sufficiencyRanges.length} faixas` : "aguardando homologação"}</small></span>
                  <span className="field-ops-list-actions">
                    <StatusBadge tone={STATUS_TONE[parameter.status]}>{parameter.status}</StatusBadge>
                    <button className="button tiny" disabled={busy === `param-status-${parameter.id}` || !parameter.sufficiencyRanges} title={!parameter.sufficiencyRanges ? "Cadastre as faixas antes de homologar" : undefined} onClick={() => void toggleParameterStatus(parameter)}>{parameter.status === "ACTIVE" ? "Reverter" : "Homologar"}</button>
                  </span>
                </div>
              ))}
              {!parameters.length && <p className="report-empty-note" style={{ padding: 12 }}>Nenhum parâmetro cadastrado para esta cultura ainda.</p>}
            </div>
          </div>
        ) : <p className="report-empty-note" style={{ padding: "0 22px 18px" }}>Selecione uma cultura na seção acima.</p>}
      </details>

      <details><summary><span><b>3</b><strong>Regiões técnicas</strong><small>Escopo de validade de perfis e regras</small></span><Icon name="chevron" size={16}/></summary>
        <div className="field-ops-form">
          <label><span>Código</span><input value={newRegionCode} onChange={(e) => setNewRegionCode(e.target.value)} placeholder="RS-PLANALTO"/></label>
          <label><span>Nome</span><input value={newRegionName} onChange={(e) => setNewRegionName(e.target.value)} placeholder="Planalto Médio - RS"/></label>
          <div className="field-ops-wide form-submit"><button className="button secondary" disabled={busy === "region" || !newRegionCode || !newRegionName} onClick={() => void createRegion()}>{busy === "region" ? "Salvando…" : "Cadastrar região"}</button></div>
          <div className="field-ops-wide field-ops-list">
            {regions.map((region) => <div key={region.id} className="field-ops-list-row"><span><strong>{region.name}</strong><small>{region.code}</small></span></div>)}
            {!regions.length && <p className="report-empty-note" style={{ padding: 12 }}>Nenhuma região técnica cadastrada ainda.</p>}
          </div>
        </div>
      </details>

      <details><summary><span><b>4</b><strong>Rule sets (reservado)</strong><small>Camada de regras regionais mais amplas — ainda não usada pelo motor</small></span><Icon name="chevron" size={16}/></summary>
        <div className="field-ops-form">
          <div className="field-ops-wide field-ops-list">
            {ruleSets.length ? ruleSets.map((ruleSet) => <div key={ruleSet.id} className="field-ops-list-row"><span><strong>{ruleSet.code}</strong><small>v{ruleSet.semanticVersion} · {ruleSet.regionCode} · {ruleSet.supportedCrops.join(", ")}</small></span><StatusBadge tone={STATUS_TONE[ruleSet.status] ?? "waiting"}>{ruleSet.status}</StatusBadge></div>) : <p className="report-empty-note" style={{ padding: 12 }}>Nenhum rule_set cadastrado. O motor hoje resolve direto pelo perfil de cultura (seção 1); esta tabela existe para uma futura camada de regras regionais mais amplas.</p>}
          </div>
        </div>
      </details>

      <details><summary><span><b>5</b><strong>Métodos e unidades reconhecidos</strong><small>Referência usada pelo importador de laudo</small></span><Icon name="chevron" size={16}/></summary>
        <div className="field-ops-form">
          <div className="field-ops-wide field-ops-list">
            {Object.entries(referenceUnits).map(([parameter, unit]) => <div key={parameter} className="field-ops-list-row"><span><strong>{parameter}</strong><small>unidade padrão: {unit}</small></span></div>)}
          </div>
        </div>
      </details>

      <details><summary><span><b>6</b><strong>Fontes técnicas</strong><small>Base de conhecimento — só ACTIVE pode ser citada pela IA</small></span><Icon name="chevron" size={16}/></summary>
        <div className="field-ops-form">
          <label><span>Título</span><input value={newSourceTitle} onChange={(e) => setNewSourceTitle(e.target.value)} placeholder="Manual de adubação e calagem RS/SC"/></label>
          <label><span>Instituição/autoria</span><input value={newSourceInstitution} onChange={(e) => setNewSourceInstitution(e.target.value)} placeholder="CQFS RS/SC"/></label>
          <label><span>Cultura</span><select value={newSourceCropProfileId} onChange={(e) => setNewSourceCropProfileId(e.target.value)}><option value="">Não vinculada</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label><span>Assunto</span><input value={newSourceSubject} onChange={(e) => setNewSourceSubject(e.target.value)} placeholder="Faixas de suficiência de fósforo"/></label>
          <div className="field-ops-wide form-submit"><button className="button secondary" disabled={busy === "source" || !newSourceTitle} onClick={() => void createSource()}>{busy === "source" ? "Salvando…" : "Cadastrar fonte técnica"}</button></div>
          <div className="field-ops-wide field-ops-list">
            {sources.length ? sources.map((source) => (
              <div key={source.id} className="field-ops-list-row">
                <span><strong>{source.title}</strong><small>{[source.institution, source.editionYear, source.cropProfileName, source.subject].filter(Boolean).join(" · ") || "sem detalhes adicionais"}</small></span>
                <span className="field-ops-list-actions">
                  <StatusBadge tone={STATUS_TONE[source.status]}>{source.status}</StatusBadge>
                  <button className="button tiny" disabled={busy === `source-status-${source.id}`} onClick={() => void toggleSourceStatus(source)}>{source.status === "ACTIVE" ? "Reverter" : "Homologar"}</button>
                </span>
              </div>
            )) : <p className="report-empty-note" style={{ padding: 12 }}>Nenhuma fonte técnica cadastrada ainda. Enquanto não houver nenhuma ACTIVE, a IA não cita nenhuma referência bibliográfica.</p>}
          </div>
        </div>
      </details>
    </div>
  );
}
