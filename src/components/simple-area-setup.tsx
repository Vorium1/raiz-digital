"use client";

import { useMemo, useState } from "react";
import { GeoMapInput } from "@/components/geo-map-input";
import { Icon } from "@/components/icon";

type Client = { id: string; name: string };
type Property = { id: string; clientId: string; name: string; municipality: string; state: string; boundary?: object | null };
type Field = { id: string; propertyId: string; name: string; areaHa: number; boundary?: object | null };
type Season = { id: string; fieldId: string; seasonLabel: string; currentCrop: string | null; nextCrop: string | null };
type CropProfile = { id: string; code: string; name: string; status: string };

type Props = {
  clients: Client[];
  properties: Property[];
  fields: Field[];
  seasons: Season[];
  cropProfiles: CropProfile[];
  clientId: string;
  propertyId: string;
  fieldId: string;
  onCreated: (kind: "client" | "property" | "field" | "season", id: string) => Promise<void> | void;
};

async function postJson(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? "Não foi possível salvar agora.");
  return payload;
}

function parseBoundary(value: string): object | null {
  try {
    const parsed = JSON.parse(value) as { type?: unknown; coordinates?: unknown };
    if (!parsed || (parsed.type !== "Polygon" && parsed.type !== "MultiPolygon") || !Array.isArray(parsed.coordinates)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function SimpleAreaSetup({
  clients,
  properties,
  fields,
  seasons,
  cropProfiles,
  clientId,
  propertyId,
  fieldId,
  onCreated,
}: Props) {
  const [clientName, setClientName] = useState("");
  const [propertyName, setPropertyName] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [state, setState] = useState("");
  const [fieldName, setFieldName] = useState("");
  const [boundary, setBoundary] = useState("");
  const [seasonLabel, setSeasonLabel] = useState("");
  const [cropProfileId, setCropProfileId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedProperty = properties.find((item) => item.id === propertyId) ?? null;
  const activeCropProfiles = useMemo(
    () => cropProfiles.filter((profile) => profile.status === "ACTIVE"),
    [cropProfiles],
  );

  const needsClient = clients.length === 0;
  const needsProperty = Boolean(clientId) && properties.length === 0;
  const needsField = Boolean(propertyId) && fields.length === 0;
  const needsSeason = Boolean(fieldId) && seasons.length === 0;

  if (!needsClient && !needsProperty && !needsField && !needsSeason) return null;

  async function run(work: () => Promise<{ kind: "client" | "property" | "field" | "season"; id: string }>) {
    setBusy(true);
    setError("");
    try {
      const result = await work();
      await onCreated(result.kind, result.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar agora.");
    } finally {
      setBusy(false);
    }
  }

  if (needsClient) {
    return (
      <section className="simple-inline-setup">
        <div className="simple-inline-setup-head">
          <span><Icon name="users" size={19}/></span>
          <div><strong>Quem é o cliente ou produtor?</strong><small>É só para organizar de quem são estes dados.</small></div>
        </div>
        <label><span>Nome</span><input autoFocus value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Ex.: Rafael Cabeda"/></label>
        {error && <div className="simple-inline-setup-error">{error}</div>}
        <button type="button" disabled={busy || clientName.trim().length < 2} onClick={() => void run(async () => {
          const payload = await postJson("/api/clients", { name: clientName.trim() });
          return { kind: "client" as const, id: payload.client.id as string };
        })}>{busy ? "Salvando…" : "Continuar"}<Icon name="arrow" size={14}/></button>
      </section>
    );
  }

  if (needsProperty) {
    return (
      <section className="simple-inline-setup">
        <div className="simple-inline-setup-head">
          <span><Icon name="home" size={19}/></span>
          <div><strong>Qual é a fazenda?</strong><small>Informe só o nome e onde ela fica.</small></div>
        </div>
        <div className="simple-inline-setup-grid">
          <label className="wide"><span>Nome da fazenda</span><input value={propertyName} onChange={(event) => setPropertyName(event.target.value)} placeholder="Ex.: Fazenda Boa Vista"/></label>
          <label><span>Município</span><input value={municipality} onChange={(event) => setMunicipality(event.target.value)} placeholder="Ex.: Água Santa"/></label>
          <label><span>UF</span><input value={state} maxLength={2} onChange={(event) => setState(event.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} placeholder="RS"/></label>
        </div>
        {error && <div className="simple-inline-setup-error">{error}</div>}
        <button type="button" disabled={busy || !propertyName.trim() || !municipality.trim() || state.length !== 2} onClick={() => void run(async () => {
          const payload = await postJson("/api/properties", {
            clientId,
            name: propertyName.trim(),
            municipality: municipality.trim(),
            state,
          });
          return { kind: "property" as const, id: payload.property.id as string };
        })}>{busy ? "Salvando…" : "Continuar"}<Icon name="arrow" size={14}/></button>
      </section>
    );
  }

  if (needsField) {
    const geometry = parseBoundary(boundary);
    return (
      <section className="simple-inline-setup">
        <div className="simple-inline-setup-head">
          <span><Icon name="layers" size={19}/></span>
          <div><strong>Qual área recebeu este laudo?</strong><small>Dê um nome e marque o contorno no mapa. A área em hectares é calculada automaticamente.</small></div>
        </div>
        <label><span>Nome da área</span><input value={fieldName} onChange={(event) => setFieldName(event.target.value)} placeholder="Ex.: Área 01"/></label>
        <div className="simple-inline-map">
          <GeoMapInput value={boundary} onChange={setBoundary} referenceBoundary={selectedProperty?.boundary as any} height={300}/>
        </div>
        {boundary && geometry && <div className="simple-inline-setup-ok"><Icon name="check" size={15}/> Área marcada.</div>}
        {error && <div className="simple-inline-setup-error">{error}</div>}
        <button type="button" disabled={busy || !fieldName.trim() || !geometry} onClick={() => void run(async () => {
          const payload = await postJson("/api/fields", {
            propertyId,
            name: fieldName.trim(),
            boundary: geometry,
          });
          return { kind: "field" as const, id: payload.field.id as string };
        })}>{busy ? "Salvando…" : "Continuar"}<Icon name="arrow" size={14}/></button>
      </section>
    );
  }

  if (needsSeason) {
    const selectedProfile = activeCropProfiles.find((profile) => profile.id === cropProfileId) ?? null;
    return (
      <section className="simple-inline-setup">
        <div className="simple-inline-setup-head">
          <span><Icon name="leaf" size={19}/></span>
          <div><strong>Qual safra e cultura?</strong><small>Isso liga a análise às regras agronômicas corretas.</small></div>
        </div>
        <div className="simple-inline-setup-grid">
          <label><span>Safra</span><input value={seasonLabel} onChange={(event) => setSeasonLabel(event.target.value)} placeholder="Ex.: 2026/27"/></label>
          <label><span>Cultura</span><select value={cropProfileId} onChange={(event) => setCropProfileId(event.target.value)}><option value="">Escolha</option>{activeCropProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
        </div>
        {activeCropProfiles.length === 0 && <div className="simple-inline-setup-error">Nenhuma cultura está disponível para análise neste momento. Isso precisa ser corrigido na configuração técnica da RAIZ.</div>}
        {error && <div className="simple-inline-setup-error">{error}</div>}
        <button type="button" disabled={busy || !seasonLabel.trim() || !selectedProfile} onClick={() => void run(async () => {
          const payload = await postJson("/api/crop-seasons", {
            fieldId,
            seasonLabel: seasonLabel.trim(),
            nextCrop: selectedProfile?.name ?? "",
            cropProfileId: selectedProfile?.id ?? null,
          });
          return { kind: "season" as const, id: payload.season.id as string };
        })}>{busy ? "Salvando…" : "Usar esta área"}<Icon name="check" size={14}/></button>
      </section>
    );
  }

  return null;
}
