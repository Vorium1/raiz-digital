"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/ui";

type Nutrient = "N" | "P2O5" | "K2O" | "S" | "Ca" | "Mg";
type Mode = "SINGLE" | "PK_PAIR" | "LIME";

type Snapshot = {
  id: string;
  label: string | null;
  simulationMode: Mode;
  schemaVersion: number;
  areaHa: number;
  sourceTargets: Array<{ inputType?: string; canonicalTarget?: string; quantity?: number; unit?: string }>;
  productSnapshots: Array<{ id?: string; code?: string; name?: string; pricePerTon?: number | null; prntPercent?: number | null }>;
  engineInput: Record<string, unknown>;
  engineOutput: any;
  createdBy?: string;
  createdByName?: string | null;
  createdAt: string;
};

function number(value: unknown, digits = 2) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("pt-BR", { maximumFractionDigits: digits })
    : "—";
}

function money(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";
}

function modeLabel(mode: Mode) {
  return mode === "SINGLE" ? "Produto único" : mode === "PK_PAIR" ? "Combinação P/K" : "Calcário / PRNT";
}

function resultSummary(snapshot: Snapshot) {
  const output = snapshot.engineOutput ?? {};
  if (snapshot.simulationMode === "PK_PAIR") {
    return `${number(output.productA?.rateKgPerHa)} + ${number(output.productB?.rateKgPerHa)} kg/ha · ${money(output.costPerHa)}/ha · total ${money(output.totalCost)}`;
  }
  if (snapshot.simulationMode === "LIME") {
    return `${number(output.productDoseTonPerHa, 4)} t/ha · ${number(output.totalProductTon, 4)} t no talhão · ${money(output.costPerHa)}/ha`;
  }
  return `${number(output.rateKgPerHa)} kg/ha · ${number(output.totalProductTon, 4)} t no talhão · ${money(output.costPerHa)}/ha`;
}

export function CommercialPlanSnapshotPanel({
  analysisId,
  enabled,
  mode,
  productId,
  productAId,
  productBId,
  driverNutrient,
}: {
  analysisId: string;
  enabled: boolean;
  mode: Mode;
  productId: string | null;
  productAId: string | null;
  productBId: string | null;
  driverNutrient: Nutrient | null;
}) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [canSave, setCanSave] = useState(false);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/analyses/${analysisId}/commercial-plan-snapshots`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o histórico comercial.");
      setSnapshots((data.snapshots ?? []) as Snapshot[]);
      setCanSave(Boolean(data.canSave));
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao carregar histórico comercial." });
    } finally {
      setLoading(false);
    }
  }, [analysisId]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setBusy(true); setMessage(null);
    try {
      const payload = mode === "SINGLE"
        ? { mode, productId, driverNutrient, label }
        : mode === "PK_PAIR"
          ? { mode, productAId, productBId, label }
          : { mode, productId, label };
      const response = await fetch(`/api/analyses/${analysisId}/commercial-plan-snapshots`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível salvar o cenário comercial.");
      setLabel("");
      setMessage({ tone: "success", text: "Cenário salvo como snapshot imutável. Alterações futuras no catálogo não reescrevem este histórico." });
      await load();
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao salvar cenário comercial." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="narrative-block" style={{ marginTop: 14 }}>
      <div className="narrative-panel-head">
        <div><span className="eyebrow">HISTÓRICO COMERCIAL</span><h4>Cenários congelados</h4></div>
        <StatusBadge tone={snapshots.length > 0 ? "success" : "waiting"}>{snapshots.length} salvo(s)</StatusBadge>
      </div>
      <p className="report-empty-note" style={{ marginTop: 0 }}>Salvar é uma ação explícita. O servidor recalcula usando a recomendação oficial corrente e o catálogo atual; depois congela alvos, produto, fórmula, preço, PRNT, limites e resultado. O registro não vira recomendação agronômica e não pode ser editado ou apagado pelo runtime.</p>

      {canSave && <div className="review-grid" style={{ marginBottom: 10 }}>
        <label className="review-summary"><span>Nome do cenário (opcional)</span><input value={label} maxLength={160} onChange={(event) => setLabel(event.target.value)} placeholder="Ex.: Compra cooperativa setembro"/></label>
        <div className="review-summary"><span>Salvar resultado atual</span><button className="button secondary" disabled={!enabled || busy} onClick={() => void save()}>{busy ? "Recalculando e salvando…" : "Salvar cenário comercial"}</button><small>{enabled ? "O resultado será recalculado no servidor antes do snapshot." : "Calcule uma simulação acima antes de salvar."}</small></div>
      </div>}

      {!canSave && !loading && <p className="report-empty-note">Seu perfil pode consultar os cenários salvos, mas não criar novos snapshots.</p>}
      {message && <div className={`agro-message ${message.tone}`} style={{ marginBottom: 10 }}><Icon name={message.tone === "success" ? "check" : "warning"} size={14}/><span>{message.text}</span></div>}

      {loading ? <div className="agro-loading"><Icon name="clock" size={13}/>Carregando histórico…</div> : snapshots.length === 0 ? <p className="report-empty-note">Nenhum cenário comercial foi congelado ainda.</p> : <div className="field-ops-list">{snapshots.map((snapshot) => (
        <div key={snapshot.id} className="field-ops-list-row">
          <span>
            <strong>{snapshot.label || modeLabel(snapshot.simulationMode)}</strong>
            <small>{modeLabel(snapshot.simulationMode)} · {new Date(snapshot.createdAt).toLocaleString("pt-BR")}{snapshot.createdByName ? ` · ${snapshot.createdByName}` : ""}</small>
            <small>{snapshot.productSnapshots.map((product) => `${product.name ?? product.code ?? "Produto"}${product.pricePerTon == null ? "" : ` · ${money(product.pricePerTon)}/t`}`).join(" + ")}</small>
            <small>{resultSummary(snapshot)}</small>
          </span>
          <StatusBadge tone="info">Snapshot v{snapshot.schemaVersion}</StatusBadge>
        </div>
      ))}</div>}
    </div>
  );
}
