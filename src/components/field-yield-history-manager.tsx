"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";

type FieldOption = { id: string; name: string; areaHa: number };
type YieldEntry = {
  id: string; fieldId: string; seasonLabel: string; crop: string; cultivar: string | null;
  yieldValue: number; yieldUnit: string; source: string | null; createdAt: string;
};

const YIELD_UNITS = ["sc/ha", "t/ha", "kg/ha", "@/ha"];

export function FieldYieldHistoryManager({ fields }: { fields: FieldOption[] }) {
  const [fieldId, setFieldId] = useState("");
  const [entries, setEntries] = useState<YieldEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const [seasonLabel, setSeasonLabel] = useState("");
  const [crop, setCrop] = useState("");
  const [cultivar, setCultivar] = useState("");
  const [yieldValue, setYieldValue] = useState("");
  const [yieldUnit, setYieldUnit] = useState("sc/ha");
  const [source, setSource] = useState("");

  useEffect(() => { setFieldId((current) => current || fields[0]?.id || ""); }, [fields]);

  useEffect(() => {
    if (!fieldId) { setEntries([]); return; }
    setLoading(true);
    fetch(`/api/field-yield-history?fieldId=${fieldId}`, { cache: "no-store" })
      .then((response) => response.json().catch(() => ({})))
      .then((payload) => setEntries((payload.entries ?? []) as YieldEntry[]))
      .finally(() => setLoading(false));
  }, [fieldId]);

  async function reload() {
    if (!fieldId) return;
    const response = await fetch(`/api/field-yield-history?fieldId=${fieldId}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    setEntries((payload.entries ?? []) as YieldEntry[]);
  }

  async function addEntry() {
    setBusy("add"); setMessage(null);
    try {
      const response = await fetch("/api/field-yield-history", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ fieldId, seasonLabel, crop, cultivar, yieldValue, yieldUnit, source }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Falha ao registrar produtividade.");
      setSeasonLabel(""); setCrop(""); setCultivar(""); setYieldValue(""); setSource("");
      setMessage({ tone: "success", text: "Produtividade registrada no histórico." });
      await reload();
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao registrar produtividade." });
    } finally { setBusy(""); }
  }

  async function removeEntry(entry: YieldEntry) {
    if (!window.confirm(`Excluir o registro de ${entry.seasonLabel} (${entry.crop})?`)) return;
    setBusy(`delete-${entry.id}`); setMessage(null);
    try {
      const response = await fetch(`/api/field-yield-history/${entry.id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Falha ao excluir registro.");
      setMessage({ tone: "success", text: "Registro excluído." });
      await reload();
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao excluir registro." });
    } finally { setBusy(""); }
  }

  const selectedField = fields.find((field) => field.id === fieldId);

  return <div className="field-ops-form">
    {message && <div className={`field-ops-wide field-ops-message ${message.tone}`}><Icon name={message.tone === "success" ? "check" : "warning"} size={17}/><span>{message.text}</span></div>}
    <label className="field-ops-wide"><span>Talhão</span><select value={fieldId} onChange={(e) => setFieldId(e.target.value)}><option value="">Selecione</option>{fields.map((field) => <option key={field.id} value={field.id}>{field.name} · {Number(field.areaHa).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</option>)}</select></label>
    <label><span>Safra</span><input value={seasonLabel} onChange={(e) => setSeasonLabel(e.target.value)} placeholder="Ex.: 2023/24"/></label>
    <label><span>Cultura</span><input value={crop} onChange={(e) => setCrop(e.target.value)} placeholder="Soja"/></label>
    <label><span>Cultivar/variedade</span><input value={cultivar} onChange={(e) => setCultivar(e.target.value)} placeholder="Opcional"/></label>
    <label><span>Produtividade realizada</span><input value={yieldValue} onChange={(e) => setYieldValue(e.target.value)} inputMode="decimal" placeholder="62"/></label>
    <label><span>Unidade</span><select value={yieldUnit} onChange={(e) => setYieldUnit(e.target.value)}>{YIELD_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label>
    <label><span>Origem do dado</span><input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Ex.: nota do produtor, monitor de colheita"/></label>
    <div className="field-ops-wide form-submit"><button className="button secondary" disabled={busy === "add" || !fieldId || !seasonLabel || !crop || !yieldValue} onClick={() => void addEntry()}>{busy === "add" ? "Salvando…" : "Registrar produtividade"}</button></div>

    {!fieldId ? null : loading ? <div className="field-ops-wide"><small>Carregando histórico…</small></div> : entries.length === 0 ? (
      <div className="field-ops-wide"><small>Nenhuma produtividade registrada ainda para {selectedField?.name ?? "este talhão"}.</small></div>
    ) : (
      <div className="field-ops-wide field-ops-list">
        {entries.map((entry) => (
          <div key={entry.id} className="field-ops-list-row">
            <span><strong>{entry.seasonLabel} · {entry.crop}{entry.cultivar ? ` "${entry.cultivar}"` : ""}</strong><small>{entry.yieldValue.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {entry.yieldUnit}{entry.source ? ` · ${entry.source}` : ""}</small></span>
            <span className="field-ops-list-actions">
              <button type="button" className="icon-button" aria-label={`Excluir registro de ${entry.seasonLabel}`} disabled={busy === `delete-${entry.id}`} onClick={() => void removeEntry(entry)}><Icon name={busy === `delete-${entry.id}` ? "clock" : "trash"} size={14}/></button>
            </span>
          </div>
        ))}
      </div>
    )}
  </div>;
}
