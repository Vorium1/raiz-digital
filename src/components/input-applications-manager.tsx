"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";

type Application = {
  id: string; analysisId: string; inputType: string; quantity: number; unit: string;
  appliedAt: string | null; notes: string | null; createdAt: string; appliedByName: string | null;
};

const INPUT_UNITS = ["kg/ha", "t/ha", "sc/ha", "L/ha", "kg", "t", "L"];

export function InputApplicationsManager({ analysisId, canEdit }: { analysisId: string; canEdit: boolean }) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const [inputType, setInputType] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("kg/ha");
  const [appliedAt, setAppliedAt] = useState("");
  const [notes, setNotes] = useState("");

  async function reload() {
    setLoading(true);
    try {
      const response = await fetch(`/api/input-applications?analysisId=${analysisId}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      setApplications((payload.applications ?? []) as Application[]);
    } finally { setLoading(false); }
  }

  useEffect(() => { void reload(); }, [analysisId]);

  async function addApplication() {
    setBusy("add"); setMessage(null);
    try {
      const response = await fetch("/api/input-applications", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ analysisId, inputType, quantity, unit, appliedAt, notes }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Falha ao registrar aplicação.");
      setInputType(""); setQuantity(""); setAppliedAt(""); setNotes("");
      setMessage({ tone: "success", text: "Aplicação de insumo registrada." });
      await reload();
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao registrar aplicação." });
    } finally { setBusy(""); }
  }

  async function removeApplication(application: Application) {
    if (!window.confirm(`Excluir o registro de "${application.inputType}"?`)) return;
    setBusy(`delete-${application.id}`); setMessage(null);
    try {
      const response = await fetch(`/api/input-applications/${application.id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Falha ao excluir registro.");
      setMessage({ tone: "success", text: "Registro excluído." });
      await reload();
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao excluir registro." });
    } finally { setBusy(""); }
  }

  return <section className="card">
    <div className="card-header"><div><span className="eyebrow">USO REAL</span><h2>Insumos aplicados</h2></div></div>
    <div className="review-actions">
      <small className="audit-hint"><Icon name="history" size={12}/>Registro do que foi de fato usado em campo (calcário, fertilizante, corretivos). Ainda não há comparação automática com a quantidade recomendada — depende da homologação das fórmulas de cálculo.</small>
      {message && <div className={`field-ops-message ${message.tone}`} style={{ marginTop: 10 }}><Icon name={message.tone === "success" ? "check" : "warning"} size={15}/><span>{message.text}</span></div>}
      {canEdit && <div className="sidebar-form" style={{ marginTop: 14 }}>
        <label><span>Insumo</span><input value={inputType} onChange={(e)=>setInputType(e.target.value)} placeholder="Ex.: Calcário dolomítico"/></label>
        <div className="sidebar-form-row">
          <label><span>Quantidade</span><input value={quantity} onChange={(e)=>setQuantity(e.target.value)} inputMode="decimal" placeholder="1500"/></label>
          <label><span>Unidade</span><select value={unit} onChange={(e)=>setUnit(e.target.value)}>{INPUT_UNITS.map((option)=><option key={option} value={option}>{option}</option>)}</select></label>
        </div>
        <label><span>Data de aplicação</span><input type="date" value={appliedAt} onChange={(e)=>setAppliedAt(e.target.value)}/></label>
        <label><span>Observação</span><input value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="Opcional"/></label>
        <div className="form-submit"><button className="button secondary" disabled={busy === "add" || !inputType || !quantity} onClick={()=>void addApplication()}>{busy === "add" ? "Salvando…" : "Registrar aplicação"}</button></div>
      </div>}
      {loading ? <small style={{ display: "block", marginTop: 12 }}>Carregando…</small> : applications.length === 0 ? (
        <small style={{ display: "block", marginTop: 12 }}>Nenhuma aplicação registrada ainda para esta análise.</small>
      ) : (
        <div className="field-ops-list" style={{ marginTop: 12 }}>
          {applications.map((application) => (
            <div key={application.id} className="field-ops-list-row">
              <span><strong>{application.inputType}</strong><small>{application.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {application.unit}{application.appliedAt ? ` · ${new Date(application.appliedAt).toLocaleDateString("pt-BR")}` : ""}{application.appliedByName ? ` · ${application.appliedByName}` : ""}</small>{application.notes && <small>{application.notes}</small>}</span>
              {canEdit && <span className="field-ops-list-actions"><button type="button" className="icon-button" aria-label={`Excluir ${application.inputType}`} disabled={busy === `delete-${application.id}`} onClick={()=>void removeApplication(application)}><Icon name={busy === `delete-${application.id}` ? "clock" : "trash"} size={14}/></button></span>}
            </div>
          ))}
        </div>
      )}
    </div>
  </section>;
}
