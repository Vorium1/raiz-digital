"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { GeoMapInput } from "@/components/geo-map-input";
import { RealFieldMap } from "@/components/real-field-map";
import { FieldYieldHistoryManager } from "@/components/field-yield-history-manager";

type Geometry = { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
type ContextData = {
  clients: Array<{ id: string; name: string }>;
  properties: Array<{ id: string; clientId: string; name: string; municipality: string; state: string; boundary: Geometry | null }>;
  fields: Array<{ id: string; propertyId: string; name: string; areaHa: number; boundary: Geometry }>;
  seasons: Array<{
    id: string; fieldId: string; seasonLabel: string; currentCrop: string | null; nextCrop: string | null; yieldGoal: number | null; yieldGoalUnit: string | null; irrigated: boolean;
    cropProfileId: string | null; cultivar: string | null; managementSystem: string | null; soilType: string | null; soilTexture: string | null; technicalRegionCode: string | null;
    nextCultivar: string | null; technologyLevel: string | null; soilCompactionLevel: string | null; livestockTrampleAreaHa: number | null; headlandAreaHa: number | null;
    isFirstYearArea: boolean | null; cultivationYears: number | null;
  }>;
  cropProfiles: Array<{ id: string; code: string; name: string; status: "DRAFT" | "ACTIVE" | "SUPERSEDED" }>;
  technicalRegions: Array<{ id: string; code: string; name: string }>;
};

const MANAGEMENT_SYSTEMS = ["Plantio direto", "Cultivo mínimo", "Convencional"];
const SOIL_TEXTURES = ["Arenosa", "Média", "Argilosa"];
const TECHNOLOGY_LEVELS = ["BAIXO", "MEDIO", "ALTO"];
const COMPACTION_LEVELS = ["NENHUM", "BAIXO", "MEDIO", "ALTO"];
const TECHNOLOGY_LEVEL_LABELS: Record<string, string> = { BAIXO: "Baixo", MEDIO: "Médio", ALTO: "Alto" };
const COMPACTION_LEVEL_LABELS: Record<string, string> = { NENHUM: "Nenhum", BAIXO: "Baixo", MEDIO: "Médio", ALTO: "Alto" };

type Point = {
  id: string; code: string; sequence: number | null; latitude: number; longitude: number;
  observedLatitude: number | null; observedLongitude: number | null; collectedAt: string | null;
  depthFromCm: number; depthToCm: number; subsampleCount: number | null; accuracyM: number | null; gpsSource: string | null;
  notes: string | null;
  labResultCount: number;
};
type Order = {
  id: string; code: string; status: "PLANNED" | "IN_PROGRESS" | "DONE" | "CANCELED";
  samplingStrategy: "GRID" | "IMPORTED" | "MANUAL"; gridAreaHa: number | null;
  depthFromCm: number; depthToCm: number; plannedAt: string | null; assignedToName: string | null;
  cropSeasonId: string; seasonLabel: string; fieldId: string; fieldName: string; fieldAreaHa: number;
  propertyName: string; clientName: string; fieldBoundary: Geometry; plannedPoints: number; collectedPoints: number; points: Point[];
};

const emptyContext: ContextData = { clients: [], properties: [], fields: [], seasons: [], cropProfiles: [], technicalRegions: [] };

function geoJsonObject(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parsed = JSON.parse(trimmed) as Geometry;
  if (!parsed || (parsed.type !== "Polygon" && parsed.type !== "MultiPolygon") || !Array.isArray(parsed.coordinates)) throw new Error("Use GeoJSON Polygon ou MultiPolygon em WGS84.");
  return parsed;
}


export function FieldOperationsManager() {
  const [context, setContext] = useState<ContextData>(emptyContext);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const [propertyClientId, setPropertyClientId] = useState("");
  const [propertyName, setPropertyName] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [state, setState] = useState("RS");
  const [propertyBoundary, setPropertyBoundary] = useState("");

  const [fieldPropertyId, setFieldPropertyId] = useState("");
  const [fieldName, setFieldName] = useState("");
  const [fieldBoundary, setFieldBoundary] = useState("");

  const [seasonFieldId, setSeasonFieldId] = useState("");
  const [seasonLabel, setSeasonLabel] = useState("2026/27");
  const [cropProfileId, setCropProfileId] = useState("");
  const [nextCrop, setNextCrop] = useState("");
  const [yieldGoal, setYieldGoal] = useState("");
  const [irrigated, setIrrigated] = useState(false);
  const [cultivar, setCultivar] = useState("");
  const [managementSystem, setManagementSystem] = useState("");
  const [soilTexture, setSoilTexture] = useState("");
  const [technicalRegionCode, setTechnicalRegionCode] = useState("");
  const [nextCultivar, setNextCultivar] = useState("");
  const [technologyLevel, setTechnologyLevel] = useState("");
  const [soilCompactionLevel, setSoilCompactionLevel] = useState("");
  const [livestockTrampleAreaHa, setLivestockTrampleAreaHa] = useState("");
  const [headlandAreaHa, setHeadlandAreaHa] = useState("");
  const [isFirstYearArea, setIsFirstYearArea] = useState(false);
  const [cultivationYears, setCultivationYears] = useState("");

  const [editingPropertyId, setEditingPropertyId] = useState("");
  const [editPropertyName, setEditPropertyName] = useState("");
  const [editMunicipality, setEditMunicipality] = useState("");
  const [editState, setEditState] = useState("");

  const [editingFieldId, setEditingFieldId] = useState("");
  const [editFieldName, setEditFieldName] = useState("");

  const [editingSeasonId, setEditingSeasonId] = useState("");
  const [editSeasonLabel, setEditSeasonLabel] = useState("");
  const [editCropProfileId, setEditCropProfileId] = useState("");
  const [editNextCrop, setEditNextCrop] = useState("");
  const [editYieldGoal, setEditYieldGoal] = useState("");
  const [editIrrigated, setEditIrrigated] = useState(false);
  const [editCultivar, setEditCultivar] = useState("");
  const [editNextCultivar, setEditNextCultivar] = useState("");
  const [editTechnologyLevel, setEditTechnologyLevel] = useState("");
  const [editSoilCompactionLevel, setEditSoilCompactionLevel] = useState("");
  const [editLivestockTrampleAreaHa, setEditLivestockTrampleAreaHa] = useState("");
  const [editHeadlandAreaHa, setEditHeadlandAreaHa] = useState("");
  const [editIsFirstYearArea, setEditIsFirstYearArea] = useState(false);
  const [editCultivationYears, setEditCultivationYears] = useState("");

  const [orderSeasonId, setOrderSeasonId] = useState("");
  const [strategy, setStrategy] = useState<"GRID" | "IMPORTED">("GRID");
  const [gridAreaHa, setGridAreaHa] = useState("2");
  const [depthFromCm, setDepthFromCm] = useState("0");
  const [depthToCm, setDepthToCm] = useState("20");
  const [plannedAt, setPlannedAt] = useState("");

  const [openNoteId, setOpenNoteId] = useState("");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const selectedOrder = orders.find((order)=>order.id === selectedOrderId) ?? orders[0] ?? null;
  const selectedField = context.fields.find((field)=>field.id === seasonFieldId);
  const selectedSeason = context.seasons.find((season)=>season.id === orderSeasonId);
  const progress = selectedOrder?.plannedPoints ? Math.round(selectedOrder.collectedPoints / selectedOrder.plannedPoints * 100) : 0;

  async function loadAll(preferOrderId?: string) {
    setLoading(true);
    try {
      const [contextResponse, ordersResponse] = await Promise.all([
        fetch("/api/context", { cache: "no-store" }),
        fetch("/api/collection-orders", { cache: "no-store" }),
      ]);
      const contextPayload = await contextResponse.json().catch(()=>({}));
      const ordersPayload = await ordersResponse.json().catch(()=>({}));
      if (!contextResponse.ok) throw new Error(contextPayload.error ?? "Falha ao carregar áreas.");
      if (!ordersResponse.ok) throw new Error(ordersPayload.error ?? "Falha ao carregar ordens.");
      const nextContext = contextPayload as ContextData;
      const nextOrders = (ordersPayload.orders ?? []) as Order[];
      setContext(nextContext);
      setOrders(nextOrders);
      setSelectedOrderId((current)=>preferOrderId && nextOrders.some((order)=>order.id === preferOrderId) ? preferOrderId : nextOrders.some((order)=>order.id === current) ? current : nextOrders[0]?.id ?? "");
      setPropertyClientId((current)=>current || nextContext.clients[0]?.id || "");
      setFieldPropertyId((current)=>current || nextContext.properties[0]?.id || "");
      setSeasonFieldId((current)=>current || nextContext.fields[0]?.id || "");
      setOrderSeasonId((current)=>current || nextContext.seasons[0]?.id || "");
    } finally { setLoading(false); }
  }

  useEffect(()=>{ void loadAll().catch((error)=>setMessage({ tone:"danger", text:error instanceof Error ? error.message : "Falha ao carregar operação." })); }, []);

  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    const target = document.getElementById(hash);
    if (target instanceof HTMLDetailsElement) {
      target.open = true;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [loading]);

  async function postJson(url: string, body: unknown) {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(payload.error ?? "Operação não concluída.");
    return payload;
  }

  async function createProperty() {
    setBusy("property"); setMessage(null);
    try {
      const boundary = geoJsonObject(propertyBoundary);
      await postJson("/api/properties", { clientId: propertyClientId, name: propertyName, municipality, state, boundary });
      setPropertyName(""); setPropertyBoundary("");
      setMessage({ tone:"success", text:"Propriedade cadastrada no banco." });
      await loadAll();
    } catch (error) { setMessage({ tone:"danger", text:error instanceof Error ? error.message : "Falha ao cadastrar propriedade." }); }
    finally { setBusy(""); }
  }

  async function createField() {
    setBusy("field"); setMessage(null);
    try {
      const boundary = geoJsonObject(fieldBoundary);
      if (!boundary) throw new Error("O talhão exige um polígono GeoJSON real.");
      await postJson("/api/fields", { propertyId: fieldPropertyId, name: fieldName, boundary });
      setFieldName(""); setFieldBoundary("");
      setMessage({ tone:"success", text:"Talhão validado pelo PostGIS e cadastrado." });
      await loadAll();
    } catch (error) { setMessage({ tone:"danger", text:error instanceof Error ? error.message : "Falha ao cadastrar talhão." }); }
    finally { setBusy(""); }
  }

  async function createSeason() {
    setBusy("season"); setMessage(null);
    try {
      const currentCrop = context.cropProfiles.find((profile)=>profile.id === cropProfileId)?.name ?? "";
      await postJson("/api/crop-seasons", {
        fieldId: seasonFieldId, seasonLabel, currentCrop, nextCrop, yieldGoal: yieldGoal || null, yieldGoalUnit: yieldGoal ? "sc/ha" : null, irrigated,
        cropProfileId: cropProfileId || null, cultivar, managementSystem, soilTexture, technicalRegionCode,
        nextCultivar, technologyLevel: technologyLevel || null, soilCompactionLevel: soilCompactionLevel || null,
        livestockTrampleAreaHa: livestockTrampleAreaHa || null, headlandAreaHa: headlandAreaHa || null,
        isFirstYearArea, cultivationYears: cultivationYears || null,
      });
      setNextCultivar(""); setTechnologyLevel(""); setSoilCompactionLevel(""); setLivestockTrampleAreaHa(""); setHeadlandAreaHa(""); setIsFirstYearArea(false); setCultivationYears("");
      setMessage({ tone:"success", text:"Safra vinculada ao talhão." });
      await loadAll();
    } catch (error) { setMessage({ tone:"danger", text:error instanceof Error ? error.message : "Falha ao criar safra." }); }
    finally { setBusy(""); }
  }

  async function patchJson(url: string, body: unknown) {
    const response = await fetch(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(payload.error ?? "Operação não concluída.");
    return payload;
  }

  async function deleteJson(url: string) {
    const response = await fetch(url, { method: "DELETE" });
    const payload = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(payload.error ?? "Operação não concluída.");
    return payload;
  }

  function startEditProperty(property: ContextData["properties"][number]) {
    setEditingPropertyId(property.id); setEditPropertyName(property.name); setEditMunicipality(property.municipality); setEditState(property.state);
  }

  async function saveProperty(id: string) {
    setBusy(`property-save-${id}`); setMessage(null);
    try {
      await patchJson(`/api/properties/${id}`, { name: editPropertyName, municipality: editMunicipality, state: editState });
      setEditingPropertyId(""); setMessage({ tone:"success", text:"Propriedade atualizada." });
      await loadAll();
    } catch (error) { setMessage({ tone:"danger", text:error instanceof Error ? error.message : "Falha ao editar propriedade." }); }
    finally { setBusy(""); }
  }

  async function removeProperty(property: ContextData["properties"][number]) {
    if (!window.confirm(`Excluir a propriedade "${property.name}"?`)) return;
    setBusy(`property-delete-${property.id}`); setMessage(null);
    try {
      await deleteJson(`/api/properties/${property.id}`);
      setMessage({ tone:"success", text:"Propriedade excluída." });
      await loadAll();
    } catch (error) { setMessage({ tone:"danger", text:error instanceof Error ? error.message : "Falha ao excluir propriedade." }); }
    finally { setBusy(""); }
  }

  function startEditField(field: ContextData["fields"][number]) {
    setEditingFieldId(field.id); setEditFieldName(field.name);
  }

  async function saveField(id: string) {
    setBusy(`field-save-${id}`); setMessage(null);
    try {
      await patchJson(`/api/fields/${id}`, { name: editFieldName });
      setEditingFieldId(""); setMessage({ tone:"success", text:"Talhão atualizado." });
      await loadAll();
    } catch (error) { setMessage({ tone:"danger", text:error instanceof Error ? error.message : "Falha ao editar talhão." }); }
    finally { setBusy(""); }
  }

  async function removeField(field: ContextData["fields"][number]) {
    if (!window.confirm(`Excluir o talhão "${field.name}"?`)) return;
    setBusy(`field-delete-${field.id}`); setMessage(null);
    try {
      await deleteJson(`/api/fields/${field.id}`);
      setMessage({ tone:"success", text:"Talhão excluído." });
      await loadAll();
    } catch (error) { setMessage({ tone:"danger", text:error instanceof Error ? error.message : "Falha ao excluir talhão." }); }
    finally { setBusy(""); }
  }

  function startEditSeason(season: ContextData["seasons"][number]) {
    setEditingSeasonId(season.id); setEditSeasonLabel(season.seasonLabel); setEditCropProfileId(season.cropProfileId ?? ""); setEditNextCrop(season.nextCrop ?? ""); setEditYieldGoal(season.yieldGoal != null ? String(season.yieldGoal) : ""); setEditIrrigated(season.irrigated); setEditCultivar(season.cultivar ?? "");
    setEditNextCultivar(season.nextCultivar ?? ""); setEditTechnologyLevel(season.technologyLevel ?? ""); setEditSoilCompactionLevel(season.soilCompactionLevel ?? "");
    setEditLivestockTrampleAreaHa(season.livestockTrampleAreaHa != null ? String(season.livestockTrampleAreaHa) : ""); setEditHeadlandAreaHa(season.headlandAreaHa != null ? String(season.headlandAreaHa) : "");
    setEditIsFirstYearArea(season.isFirstYearArea ?? false); setEditCultivationYears(season.cultivationYears != null ? String(season.cultivationYears) : "");
  }

  async function saveSeason(id: string) {
    setBusy(`season-save-${id}`); setMessage(null);
    try {
      const currentCrop = context.cropProfiles.find((profile)=>profile.id === editCropProfileId)?.name ?? "";
      await patchJson(`/api/crop-seasons/${id}`, {
        seasonLabel: editSeasonLabel, currentCrop, nextCrop: editNextCrop, yieldGoal: editYieldGoal || null, yieldGoalUnit: editYieldGoal ? "sc/ha" : null, irrigated: editIrrigated,
        cropProfileId: editCropProfileId || null, cultivar: editCultivar,
        nextCultivar: editNextCultivar, technologyLevel: editTechnologyLevel || null, soilCompactionLevel: editSoilCompactionLevel || null,
        livestockTrampleAreaHa: editLivestockTrampleAreaHa || null, headlandAreaHa: editHeadlandAreaHa || null,
        isFirstYearArea: editIsFirstYearArea, cultivationYears: editCultivationYears || null,
      });
      setEditingSeasonId(""); setMessage({ tone:"success", text:"Safra atualizada." });
      await loadAll();
    } catch (error) { setMessage({ tone:"danger", text:error instanceof Error ? error.message : "Falha ao editar safra." }); }
    finally { setBusy(""); }
  }

  async function removeSeason(season: ContextData["seasons"][number]) {
    if (!window.confirm(`Excluir a safra "${season.seasonLabel}"?`)) return;
    setBusy(`season-delete-${season.id}`); setMessage(null);
    try {
      await deleteJson(`/api/crop-seasons/${season.id}`);
      setMessage({ tone:"success", text:"Safra excluída." });
      await loadAll();
    } catch (error) { setMessage({ tone:"danger", text:error instanceof Error ? error.message : "Falha ao excluir safra." }); }
    finally { setBusy(""); }
  }

  async function createOrder() {
    setBusy("order"); setMessage(null);
    try {
      const payload = await postJson("/api/collection-orders", { cropSeasonId: orderSeasonId, samplingStrategy: strategy, gridAreaHa: strategy === "GRID" ? gridAreaHa : null, depthFromCm, depthToCm, plannedAt: plannedAt || null });
      const orderId = payload.order?.id as string | undefined;
      setMessage({ tone:"success", text: strategy === "GRID" ? `Ordem criada com ${payload.order?.generatedPoints ?? 0} pontos calculados.` : "Ordem criada. Importe agora os pontos GPS." });
      await loadAll(orderId);
    } catch (error) { setMessage({ tone:"danger", text:error instanceof Error ? error.message : "Falha ao criar ordem." }); }
    finally { setBusy(""); }
  }

  async function cancelOrder(order: Order) {
    if (!window.confirm(`Cancelar a ordem ${order.code}? Essa ação não pode ser desfeita.`)) return;
    setBusy(`cancel-${order.id}`); setMessage(null);
    try {
      await patchJson(`/api/collection-orders/${order.id}`, { status: "CANCELED" });
      setMessage({ tone:"success", text:`Ordem ${order.code} cancelada.` });
      await loadAll(order.id);
    } catch (error) { setMessage({ tone:"danger", text:error instanceof Error ? error.message : "Falha ao cancelar ordem." }); }
    finally { setBusy(""); }
  }

  async function importPoints(file?: File) {
    if (!file || !selectedOrder) return;
    setBusy("points"); setMessage(null);
    try {
      if (file.size > 2_500_000) throw new Error("Arquivo acima de 2,5 MB.");
      const content = await file.text();
      const response = await fetch(`/api/collection-orders/${selectedOrder.id}/points`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ fileName:file.name, content, replaceExisting:true }) });
      const payload = await response.json().catch(()=>({}));
      if (!response.ok) {
        const outside = Array.isArray(payload.details?.outside) ? ` Fora do talhão: ${payload.details.outside.join(", ")}.` : "";
        throw new Error((payload.error ?? "Falha ao importar pontos.") + outside);
      }
      setMessage({ tone:"success", text:`${payload.imported} pontos importados e validados dentro do talhão.` });
      await loadAll(selectedOrder.id);
    } catch (error) { setMessage({ tone:"danger", text:error instanceof Error ? error.message : "Falha ao importar pontos." }); }
    finally { setBusy(""); }
  }

  async function collectHere(point: Point) {
    if (!selectedOrder) return;
    setBusy(`collect-${point.id}`); setMessage(null);
    try {
      if (!("geolocation" in navigator)) throw new Error("Este dispositivo não oferece geolocalização.");
      const position = await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{ enableHighAccuracy:true, timeout:20_000, maximumAge:0 }));
      const response = await fetch(`/api/collection-orders/${selectedOrder.id}/points/${point.id}`, {
        method:"PATCH", headers:{"content-type":"application/json"},
        body:JSON.stringify({ latitude:position.coords.latitude, longitude:position.coords.longitude, accuracyM:position.coords.accuracy, notes:noteDrafts[point.id] ?? "" }),
      });
      const payload = await response.json().catch(()=>({}));
      if (!response.ok) {
        const distance = payload.details?.distanceMeters ? ` Distância: ${payload.details.distanceMeters} m; limite: ${payload.details.allowedMeters} m.` : "";
        throw new Error((payload.error ?? "Posição não validada.") + distance);
      }
      setMessage({ tone:"success", text:`${point.code} confirmado por GPS. Desvio do ponto planejado: ${Math.round(payload.point.distanceMeters)} m.` });
      setNoteDrafts((current)=>{ const next = { ...current }; delete next[point.id]; return next; });
      setOpenNoteId("");
      await loadAll(selectedOrder.id);
    } catch (error) {
      const text = error instanceof GeolocationPositionError ? `GPS indisponível: ${error.message}` : error instanceof Error ? error.message : "Falha ao registrar coleta.";
      setMessage({ tone:"danger", text });
    } finally { setBusy(""); }
  }

  async function readGeometryFile(file: File | undefined, setter: (value:string)=>void) {
    if (!file) return;
    try { setter(await file.text()); setMessage(null); }
    catch { setMessage({ tone:"danger", text:"Não foi possível ler o arquivo GeoJSON." }); }
  }

  const propertyOptions = useMemo(()=>context.properties.filter((property)=>!propertyClientId || property.clientId === propertyClientId), [context.properties, propertyClientId]);
  const selectedFieldProperty = context.properties.find((property)=>property.id === fieldPropertyId);

  if (loading && !orders.length && !context.clients.length) return <div className="data-card"><div className="empty-state"><Icon name="clock"/><strong>Carregando operação de campo…</strong><small>Consultando áreas, safras, ordens e pontos reais.</small></div></div>;

  return <div className="field-ops-stack">
    {message && <div className={`field-ops-message ${message.tone}`}><Icon name={message.tone === "success" ? "check" : "warning"} size={17}/><span>{message.text}</span></div>}

    <section className="field-ops-onboarding card">
      <div className="field-ops-section-head"><div><span className="eyebrow">BASE CARTOGRÁFICA</span><h2>Área, talhão e safra</h2><p>Cadastre uma vez. Depois a operação reaproveita o mesmo contexto em coletas, laudos, histórico e mapas.</p></div><span className="field-ops-count">{context.fields.length} talhões</span></div>
      {!context.clients.length && <div className="field-ops-inline-warning"><Icon name="users" size={18}/><span>Cadastre primeiro um cliente em <strong>Clientes</strong>.</span></div>}
      <div className="field-ops-accordion">
        <details id="propriedades"><summary><span><b>1</b><strong>Propriedade</strong><small>Município, UF e limite opcional</small></span><Icon name="chevron" size={16}/></summary><div className="field-ops-form">
          <label><span>Cliente</span><select value={propertyClientId} onChange={(e)=>{setPropertyClientId(e.target.value);setFieldPropertyId("");}}><option value="">Selecione</option>{context.clients.map((client)=><option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
          <label><span>Nome</span><input value={propertyName} onChange={(e)=>setPropertyName(e.target.value)} placeholder="Fazenda Boa Esperança"/></label>
          <label><span>Município</span><input value={municipality} onChange={(e)=>setMunicipality(e.target.value)} placeholder="Passo Fundo"/></label>
          <label><span>UF</span><input value={state} maxLength={2} onChange={(e)=>setState(e.target.value.toUpperCase())}/></label>
          <label className="field-ops-wide"><span>Limite da propriedade · GeoJSON opcional</span><textarea value={propertyBoundary} onChange={(e)=>setPropertyBoundary(e.target.value)} placeholder='{"type":"Polygon","coordinates":[...]}'/><input className="geo-file" type="file" accept=".geojson,.json" onChange={(e)=>void readGeometryFile(e.target.files?.[0],setPropertyBoundary)}/><GeoMapInput value={propertyBoundary} onChange={setPropertyBoundary} height={260}/></label>
          <div className="field-ops-wide form-submit"><button className="button secondary" disabled={busy === "property" || !propertyClientId || !propertyName || !municipality} onClick={()=>void createProperty()}>{busy === "property" ? "Salvando…" : "Cadastrar propriedade"}</button></div>
          {context.properties.length > 0 && <div className="field-ops-wide field-ops-list">
            {context.properties.map((property)=>editingPropertyId === property.id ? (
              <div key={property.id} className="field-ops-list-row editing">
                <input value={editPropertyName} onChange={(e)=>setEditPropertyName(e.target.value)} placeholder="Nome"/>
                <input value={editMunicipality} onChange={(e)=>setEditMunicipality(e.target.value)} placeholder="Município"/>
                <input value={editState} maxLength={2} onChange={(e)=>setEditState(e.target.value.toUpperCase())} placeholder="UF"/>
                <span className="field-ops-list-actions">
                  <button className="button tiny" disabled={busy === `property-save-${property.id}`} onClick={()=>void saveProperty(property.id)}><Icon name="check" size={13}/></button>
                  <button className="icon-button" onClick={()=>setEditingPropertyId("")}><Icon name="close" size={13}/></button>
                </span>
              </div>
            ) : (
              <div key={property.id} className="field-ops-list-row">
                <span><strong>{property.name}</strong><small>{property.municipality}/{property.state}</small></span>
                <span className="field-ops-list-actions">
                  <button type="button" className="icon-button" aria-label={`Editar ${property.name}`} onClick={()=>startEditProperty(property)}><Icon name="edit" size={14}/></button>
                  <button type="button" className="icon-button" aria-label={`Excluir ${property.name}`} disabled={busy === `property-delete-${property.id}`} onClick={()=>void removeProperty(property)}><Icon name={busy === `property-delete-${property.id}` ? "clock" : "trash"} size={14}/></button>
                </span>
              </div>
            ))}
          </div>}
        </div></details>
        <details id="talhoes"><summary><span><b>2</b><strong>Talhão</strong><small>Polígono WGS84 obrigatório</small></span><Icon name="chevron" size={16}/></summary><div className="field-ops-form">
          <label><span>Propriedade</span><select value={fieldPropertyId} onChange={(e)=>setFieldPropertyId(e.target.value)}><option value="">Selecione</option>{propertyOptions.map((property)=><option key={property.id} value={property.id}>{property.name} · {property.municipality}/{property.state}</option>)}</select></label>
          <label><span>Nome do talhão</span><input value={fieldName} onChange={(e)=>setFieldName(e.target.value)} placeholder="Talhão Norte"/></label>
          <label className="field-ops-wide"><span>Polígono GeoJSON</span><textarea value={fieldBoundary} onChange={(e)=>setFieldBoundary(e.target.value)} placeholder='{"type":"Polygon","coordinates":[[[-52.4,-28.2],...]]}'/><input className="geo-file" type="file" accept=".geojson,.json" onChange={(e)=>void readGeometryFile(e.target.files?.[0],setFieldBoundary)}/><GeoMapInput value={fieldBoundary} onChange={setFieldBoundary} referenceBoundary={selectedFieldProperty?.boundary ?? null} height={320}/><small>O PostGIS valida geometria, calcula hectares e bloqueia talhão fora do limite da propriedade quando esse limite existe. {selectedFieldProperty?.boundary ? "O contorno tracejado no mapa mostra o limite da propriedade selecionada." : ""}</small></label>
          <div className="field-ops-wide form-submit"><button className="button secondary" disabled={busy === "field" || !fieldPropertyId || !fieldName || !fieldBoundary.trim()} onClick={()=>void createField()}>{busy === "field" ? "Validando…" : "Validar e cadastrar talhão"}</button></div>
          {context.fields.length > 0 && <div className="field-ops-wide field-ops-list">
            {context.fields.map((field)=>editingFieldId === field.id ? (
              <div key={field.id} className="field-ops-list-row editing">
                <input value={editFieldName} onChange={(e)=>setEditFieldName(e.target.value)} placeholder="Nome"/>
                <span className="field-ops-list-actions">
                  <button className="button tiny" disabled={busy === `field-save-${field.id}`} onClick={()=>void saveField(field.id)}><Icon name="check" size={13}/></button>
                  <button className="icon-button" onClick={()=>setEditingFieldId("")}><Icon name="close" size={13}/></button>
                </span>
              </div>
            ) : (
              <div key={field.id} className="field-ops-list-row">
                <span><strong>{field.name}</strong><small>{Number(field.areaHa).toLocaleString("pt-BR",{maximumFractionDigits:2})} ha</small></span>
                <span className="field-ops-list-actions">
                  <button type="button" className="icon-button" aria-label={`Editar ${field.name}`} onClick={()=>startEditField(field)}><Icon name="edit" size={14}/></button>
                  <button type="button" className="icon-button" aria-label={`Excluir ${field.name}`} disabled={busy === `field-delete-${field.id}`} onClick={()=>void removeField(field)}><Icon name={busy === `field-delete-${field.id}` ? "clock" : "trash"} size={14}/></button>
                </span>
              </div>
            ))}
          </div>}
        </div></details>
        <details id="safras"><summary><span><b>3</b><strong>Safra</strong><small>Cultura e meta do contexto agronômico</small></span><Icon name="chevron" size={16}/></summary><div className="field-ops-form">
          <label><span>Talhão</span><select value={seasonFieldId} onChange={(e)=>setSeasonFieldId(e.target.value)}><option value="">Selecione</option>{context.fields.map((field)=><option key={field.id} value={field.id}>{field.name} · {Number(field.areaHa).toLocaleString("pt-BR",{maximumFractionDigits:2})} ha</option>)}</select></label>
          <label><span>Safra</span><input value={seasonLabel} onChange={(e)=>setSeasonLabel(e.target.value)}/></label>
          <label><span>Cultura</span><select value={cropProfileId} onChange={(e)=>setCropProfileId(e.target.value)}><option value="">Selecione</option>{context.cropProfiles.map((profile)=><option key={profile.id} value={profile.id}>{profile.name}{profile.status === "DRAFT" ? " (aguardando homologação)" : ""}</option>)}</select></label>
          <label><span>Cultivar/variedade</span><input value={cultivar} onChange={(e)=>setCultivar(e.target.value)} placeholder="Ex.: TMG 7062"/></label>
          <label><span>Sistema de cultivo</span><select value={managementSystem} onChange={(e)=>setManagementSystem(e.target.value)}><option value="">Não informado</option>{MANAGEMENT_SYSTEMS.map((option)=><option key={option} value={option}>{option}</option>)}</select></label>
          <label><span>Textura do solo</span><select value={soilTexture} onChange={(e)=>setSoilTexture(e.target.value)}><option value="">Não informada</option>{SOIL_TEXTURES.map((option)=><option key={option} value={option}>{option}</option>)}</select></label>
          <label><span>Região técnica</span><select value={technicalRegionCode} onChange={(e)=>setTechnicalRegionCode(e.target.value)}><option value="">Não informada</option>{context.technicalRegions.map((region)=><option key={region.id} value={region.code}>{region.name}</option>)}</select></label>
          <label><span>Próxima cultura</span><input value={nextCrop} onChange={(e)=>setNextCrop(e.target.value)} placeholder="Milho"/></label>
          <label><span>Próximo cultivar</span><input value={nextCultivar} onChange={(e)=>setNextCultivar(e.target.value)} placeholder="Ex.: P3862"/></label>
          <label><span>Meta produtiva</span><input value={yieldGoal} onChange={(e)=>setYieldGoal(e.target.value)} inputMode="decimal" placeholder="75"/></label>
          <label><span>Área confirmada</span><input readOnly value={selectedField ? `${Number(selectedField.areaHa).toLocaleString("pt-BR",{maximumFractionDigits:2})} ha` : ""}/></label>
          <div className="field-ops-form-field"><span>Irrigação</span><label className="field-ops-checkbox"><input type="checkbox" checked={irrigated} onChange={(e)=>setIrrigated(e.target.checked)}/>Área irrigada</label></div>
          <label><span>Nível tecnológico pretendido</span><select value={technologyLevel} onChange={(e)=>setTechnologyLevel(e.target.value)}><option value="">Não informado</option>{TECHNOLOGY_LEVELS.map((level)=><option key={level} value={level}>{TECHNOLOGY_LEVEL_LABELS[level]}</option>)}</select></label>
          <label><span>Compactação do solo</span><select value={soilCompactionLevel} onChange={(e)=>setSoilCompactionLevel(e.target.value)}><option value="">Não informada</option>{COMPACTION_LEVELS.map((level)=><option key={level} value={level}>{COMPACTION_LEVEL_LABELS[level]}</option>)}</select></label>
          <label><span>Área de pisoteio/pecuária</span><div className="input-suffix"><input value={livestockTrampleAreaHa} onChange={(e)=>setLivestockTrampleAreaHa(e.target.value)} inputMode="decimal" placeholder="0"/><b>ha</b></div></label>
          <label><span>Área de cabeceira</span><div className="input-suffix"><input value={headlandAreaHa} onChange={(e)=>setHeadlandAreaHa(e.target.value)} inputMode="decimal" placeholder="0"/><b>ha</b></div></label>
          <label><span>Anos de cultivo da área</span><input value={cultivationYears} onChange={(e)=>setCultivationYears(e.target.value)} inputMode="numeric" placeholder="Ex.: 8"/></label>
          <div className="field-ops-form-field"><span>Área de abertura</span><label className="field-ops-checkbox"><input type="checkbox" checked={isFirstYearArea} onChange={(e)=>setIsFirstYearArea(e.target.checked)}/>Primeiro ano de cultivo</label></div>
          <div className="field-ops-wide form-submit"><button className="button secondary" disabled={busy === "season" || !seasonFieldId || !seasonLabel} onClick={()=>void createSeason()}>{busy === "season" ? "Salvando…" : "Criar safra"}</button></div>
          {context.seasons.length > 0 && <div className="field-ops-wide field-ops-list">
            {context.seasons.map((season)=>editingSeasonId === season.id ? (
              <div key={season.id} className="field-ops-list-row editing">
                <input value={editSeasonLabel} onChange={(e)=>setEditSeasonLabel(e.target.value)} placeholder="Safra"/>
                <select value={editCropProfileId} onChange={(e)=>setEditCropProfileId(e.target.value)}><option value="">Cultura</option>{context.cropProfiles.map((profile)=><option key={profile.id} value={profile.id}>{profile.name}</option>)}</select>
                <input value={editCultivar} onChange={(e)=>setEditCultivar(e.target.value)} placeholder="Cultivar"/>
                <input value={editNextCrop} onChange={(e)=>setEditNextCrop(e.target.value)} placeholder="Próxima cultura"/>
                <input value={editYieldGoal} onChange={(e)=>setEditYieldGoal(e.target.value)} inputMode="decimal" placeholder="Meta"/>
                <label className="field-ops-checkbox"><input type="checkbox" checked={editIrrigated} onChange={(e)=>setEditIrrigated(e.target.checked)}/>Irrigado</label>
                <input value={editNextCultivar} onChange={(e)=>setEditNextCultivar(e.target.value)} placeholder="Próximo cultivar"/>
                <select value={editTechnologyLevel} onChange={(e)=>setEditTechnologyLevel(e.target.value)}><option value="">Nível tecnológico</option>{TECHNOLOGY_LEVELS.map((level)=><option key={level} value={level}>{TECHNOLOGY_LEVEL_LABELS[level]}</option>)}</select>
                <select value={editSoilCompactionLevel} onChange={(e)=>setEditSoilCompactionLevel(e.target.value)}><option value="">Compactação</option>{COMPACTION_LEVELS.map((level)=><option key={level} value={level}>{COMPACTION_LEVEL_LABELS[level]}</option>)}</select>
                <input value={editLivestockTrampleAreaHa} onChange={(e)=>setEditLivestockTrampleAreaHa(e.target.value)} inputMode="decimal" placeholder="Pisoteio (ha)"/>
                <input value={editHeadlandAreaHa} onChange={(e)=>setEditHeadlandAreaHa(e.target.value)} inputMode="decimal" placeholder="Cabeceira (ha)"/>
                <input value={editCultivationYears} onChange={(e)=>setEditCultivationYears(e.target.value)} inputMode="numeric" placeholder="Anos de cultivo"/>
                <label className="field-ops-checkbox"><input type="checkbox" checked={editIsFirstYearArea} onChange={(e)=>setEditIsFirstYearArea(e.target.checked)}/>Área de abertura</label>
                <span className="field-ops-list-actions">
                  <button className="button tiny" disabled={busy === `season-save-${season.id}`} onClick={()=>void saveSeason(season.id)}><Icon name="check" size={13}/></button>
                  <button className="icon-button" onClick={()=>setEditingSeasonId("")}><Icon name="close" size={13}/></button>
                </span>
              </div>
            ) : (
              <div key={season.id} className="field-ops-list-row">
                <span><strong>{season.seasonLabel}</strong><small>{context.fields.find((field)=>field.id === season.fieldId)?.name ?? "Talhão"} · {season.currentCrop || "cultura não informada"}{season.cultivar ? ` "${season.cultivar}"` : ""}{season.irrigated ? " · irrigado" : ""}</small></span>
                <span className="field-ops-list-actions">
                  <button type="button" className="icon-button" aria-label={`Editar ${season.seasonLabel}`} onClick={()=>startEditSeason(season)}><Icon name="edit" size={14}/></button>
                  <button type="button" className="icon-button" aria-label={`Excluir ${season.seasonLabel}`} disabled={busy === `season-delete-${season.id}`} onClick={()=>void removeSeason(season)}><Icon name={busy === `season-delete-${season.id}` ? "clock" : "trash"} size={14}/></button>
                </span>
              </div>
            ))}
          </div>}
        </div></details>
        <details id="produtividade"><summary><span><b>4</b><strong>Produtividade real</strong><small>Histórico de safras já colhidas, por talhão</small></span><Icon name="chevron" size={16}/></summary>
          <FieldYieldHistoryManager fields={context.fields}/>
        </details>
      </div>
    </section>

    <section className="field-ops-planner card">
      <div className="field-ops-section-head"><div><span className="eyebrow">PLANEJAMENTO</span><h2>Nova ordem de coleta</h2><p>Gere grid no próprio PostGIS ou abra a ordem para receber coordenadas de GPS.</p></div><Icon name="location" size={28}/></div>
      <div className="field-order-form">
        <label><span>Safra / talhão</span><select value={orderSeasonId} onChange={(e)=>setOrderSeasonId(e.target.value)}><option value="">Selecione</option>{context.seasons.map((season)=>{const field=context.fields.find((item)=>item.id===season.fieldId);return <option key={season.id} value={season.id}>{field?.name ?? "Talhão"} · {season.seasonLabel}</option>})}</select></label>
        <label><span>Estratégia</span><select value={strategy} onChange={(e)=>setStrategy(e.target.value as "GRID"|"IMPORTED")}><option value="GRID">Gerar grid automático</option><option value="IMPORTED">Importar pontos GPS</option></select></label>
        {strategy === "GRID" && <label><span>Grid</span><div className="input-suffix"><input value={gridAreaHa} onChange={(e)=>setGridAreaHa(e.target.value)} inputMode="decimal"/><b>ha/ponto</b></div></label>}
        <label><span>Profundidade inicial</span><div className="input-suffix"><input value={depthFromCm} onChange={(e)=>setDepthFromCm(e.target.value)} inputMode="decimal"/><b>cm</b></div></label>
        <label><span>Profundidade final</span><div className="input-suffix"><input value={depthToCm} onChange={(e)=>setDepthToCm(e.target.value)} inputMode="decimal"/><b>cm</b></div></label>
        <label><span>Data planejada</span><input type="datetime-local" value={plannedAt} onChange={(e)=>setPlannedAt(e.target.value)}/></label>
      </div>
      {selectedSeason && <div className="field-ops-context"><Icon name="leaf" size={17}/><span><strong>{selectedSeason.currentCrop || "Cultura não informada"}</strong><small>{selectedSeason.seasonLabel} · próximo cultivo {selectedSeason.nextCrop || "não informado"}</small></span></div>}
      <div className="field-ops-actions"><button className="button primary" disabled={busy === "order" || !orderSeasonId} onClick={()=>void createOrder()}>{busy === "order" ? "Criando…" : strategy === "GRID" ? "Criar ordem e gerar pontos" : "Criar ordem para importação"}<Icon name="arrow" size={15}/></button></div>
    </section>

    <section className="field-ops-live">
      <div className="field-order-list card">
        <div className="field-ops-section-head compact"><div><span className="eyebrow">ORDENS</span><h2>Operação</h2></div><span className="field-ops-count">{orders.length}</span></div>
        {!orders.length ? <div className="field-order-empty"><Icon name="map"/><strong>Nenhuma ordem criada.</strong><small>Crie uma safra e gere o primeiro grid.</small></div> : orders.map((order)=><button key={order.id} className={`field-order-item ${selectedOrder?.id === order.id ? "active" : ""}`} onClick={()=>setSelectedOrderId(order.id)}><span><strong>{order.code}</strong><small>{order.clientName} · {order.fieldName}</small></span><b>{order.collectedPoints}/{order.plannedPoints}</b></button>)}
      </div>

      <div className="field-order-detail card">
        {!selectedOrder ? <div className="field-order-empty"><Icon name="location"/><strong>Selecione uma ordem.</strong></div> : <>
          <div className="field-order-detail-head"><div><span className="eyebrow">{selectedOrder.status}</span><h2>{selectedOrder.code}</h2><p>{selectedOrder.clientName} · {selectedOrder.propertyName} · {selectedOrder.fieldName}</p></div><div className="field-order-detail-actions">{selectedOrder.status === "PLANNED" && <button type="button" className="button ghost" disabled={busy === `cancel-${selectedOrder.id}`} onClick={()=>void cancelOrder(selectedOrder)}>{busy === `cancel-${selectedOrder.id}` ? "Cancelando…" : "Cancelar ordem"}</button>}<div className="order-progress-ring"><strong>{progress}%</strong><small>coletado</small></div></div></div>
          <RealFieldMap boundary={selectedOrder.fieldBoundary} points={selectedOrder.points} height={380}/>
          <div className="field-order-meta"><span><b>{selectedOrder.fieldAreaHa.toLocaleString("pt-BR",{maximumFractionDigits:2})} ha</b><small>área</small></span><span><b>{selectedOrder.gridAreaHa ? `${selectedOrder.gridAreaHa} ha` : "GPS"}</b><small>estratégia</small></span><span><b>{selectedOrder.depthFromCm}–{selectedOrder.depthToCm} cm</b><small>profundidade</small></span><span><b>{selectedOrder.plannedPoints}</b><small>pontos</small></span></div>
          {selectedOrder.samplingStrategy !== "GRID" || selectedOrder.collectedPoints === 0 ? <label className="gps-import-button"><input type="file" accept=".csv,.txt,.geojson,.json" disabled={busy === "points"} onChange={(e)=>void importPoints(e.target.files?.[0])}/><Icon name="upload" size={16}/><span><strong>{busy === "points" ? "Validando pontos…" : "Importar / substituir pontos GPS"}</strong><small>CSV: código, latitude, longitude · ou FeatureCollection GeoJSON</small></span></label> : null}
          <div className="field-point-list">
            {selectedOrder.points.slice(0, 80).map((point)=><div key={point.id} className={point.collectedAt ? "field-point-row done" : "field-point-row"}>
              <span className="point-sequence">{point.sequence ?? "–"}</span>
              <span>
                <strong>{point.code}</strong>
                <small>{point.latitude.toFixed(6)}, {point.longitude.toFixed(6)} · {point.depthFromCm}–{point.depthToCm} cm</small>
                {point.notes && <small className="point-note">Obs.: {point.notes}</small>}
              </span>
              <span className="field-point-actions">
                {point.labResultCount > 0 && <span className="point-lab-linked" title={`${point.labResultCount} resultado(s) de laudo vinculados pelo código ${point.code}`}><Icon name="flask" size={13}/>{point.labResultCount}</span>}
                {point.collectedAt ? <span className="point-collected"><Icon name="check" size={13}/>Coletado</span> : <>
                  <button type="button" className="icon-button point-note-toggle" aria-label={openNoteId === point.id ? "Fechar observação" : "Adicionar observação"} onClick={()=>setOpenNoteId(openNoteId === point.id ? "" : point.id)}><Icon name="edit" size={13}/></button>
                  <button className="button tiny" disabled={busy === `collect-${point.id}`} onClick={()=>void collectHere(point)}><Icon name="location" size={13}/>{busy === `collect-${point.id}` ? "GPS…" : "Confirmar aqui"}</button>
                </>}
              </span>
              {openNoteId === point.id && !point.collectedAt && <input className="point-note-input" value={noteDrafts[point.id] ?? ""} onChange={(e)=>setNoteDrafts((current)=>({ ...current, [point.id]: e.target.value }))} placeholder="Observação de campo (opcional) · vai junto ao confirmar" maxLength={280}/>}
            </div>)}
            {selectedOrder.points.length > 80 && <div className="point-list-more">Mostrando 80 de {selectedOrder.points.length} pontos para manter a tela leve.</div>}
          </div>
        </>}
      </div>
    </section>
  </div>;
}
