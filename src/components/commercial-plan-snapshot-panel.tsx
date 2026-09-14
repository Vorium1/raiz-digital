"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/ui";
import { buildCommercialPlanComparison } from "@/domain/commercial-plan-comparison";

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

function signedMoney(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) < 0.005) return "sem diferença";
  return `${value > 0 ? "+" : "−"}${money(Math.abs(value))}`;
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

function productsLabel(snapshot: Snapshot) {
  return snapshot.productSnapshots
    .map((product) => `${product.name ?? product.code ?? "Produto"}${product.pricePerTon == null ? "" : ` · ${money(product.pricePerTon)}/t`}`)
    .join(" + ");
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/analyses/${analysisId}/commercial-plan-snapshots`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o histórico comercial.");
      const nextSnapshots = (data.snapshots ?? []) as Snapshot[];
      setSnapshots(nextSnapshots);
      setSelectedIds((current) => current.filter((id) => nextSnapshots.some((snapshot) => snapshot.id === id)));
      setCanSave(Boolean(data.canSave));
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao carregar histórico comercial." });
    } finally {
      setLoading(false);
    }
  }, [analysisId]);

  useEffect(() => { void load(); }, [load]);

  const selectedSnapshots = useMemo(
    () => selectedIds.flatMap((id) => snapshots.find((snapshot) => snapshot.id === id) ?? []),
    [selectedIds, snapshots],
  );
  const comparison = useMemo(() => buildCommercialPlanComparison(selectedSnapshots), [selectedSnapshots]);
  const comparisonRows = useMemo(() => new Map(comparison.rows.map((row) => [row.id, row])), [comparison.rows]);

  function toggleComparison(snapshotId: string) {
    setSelectedIds((current) => current.includes(snapshotId)
      ? current.filter((id) => id !== snapshotId)
      : current.length < 3
        ? [...current, snapshotId]
        : current);
  }

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

      {loading ? <div className="agro-loading"><Icon name="clock" size={13}/>Carregando histórico…</div> : snapshots.length === 0 ? <p className="report-empty-note">Nenhum cenário comercial foi congelado ainda.</p> : <div className="field-ops-list">{snapshots.map((snapshot) => {
        const selected = selectedIds.includes(snapshot.id);
        return (
          <div key={snapshot.id} className="field-ops-list-row">
            <span>
              <strong>{snapshot.label || modeLabel(snapshot.simulationMode)}</strong>
              <small>{modeLabel(snapshot.simulationMode)} · {new Date(snapshot.createdAt).toLocaleString("pt-BR")}{snapshot.createdByName ? ` · ${snapshot.createdByName}` : ""}</small>
              <small>{productsLabel(snapshot)}</small>
              <small>{resultSummary(snapshot)}</small>
            </span>
            <div className="narrative-review-actions">
              <button
                className="button secondary"
                disabled={!selected && selectedIds.length >= 3}
                onClick={() => toggleComparison(snapshot.id)}
              >{selected ? "Remover da comparação" : "Comparar"}</button>
              <StatusBadge tone={selected ? "success" : "info"}>{selected ? "Selecionado" : `Snapshot v${snapshot.schemaVersion}`}</StatusBadge>
            </div>
          </div>
        );
      })}</div>}

      {snapshots.length >= 2 && <div className="narrative-block" style={{ marginTop: 14 }}>
        <div className="narrative-panel-head">
          <div><span className="eyebrow">COMPARAÇÃO DE CENÁRIOS</span><h4>Custo e quantidade sem mexer na dose agronômica</h4></div>
          <StatusBadge tone={selectedSnapshots.length >= 2 ? "info" : "waiting"}>{selectedSnapshots.length}/3 selecionado(s)</StatusBadge>
        </div>
        <p className="report-empty-note" style={{ marginTop: 0 }}>Selecione de dois a três snapshots. A RAIZ compara os números registrados, mas não escolhe um “melhor” produto e não usa custo para alterar a necessidade agronômica.</p>

        {selectedSnapshots.length < 2 ? <p className="report-empty-note">Selecione pelo menos dois cenários acima para abrir a comparação.</p> : <>
          {!comparison.sameAgronomicBasis && <div className="field-ops-inline-warning" style={{ marginBottom: 10 }}><Icon name="warning" size={15}/><span>Os cenários selecionados não têm a mesma base agronômica congelada. Os valores absolutos continuam visíveis, mas diferenças de custo ficam bloqueadas para evitar uma comparação enganosa.</span></div>}
          {comparison.sameAgronomicBasis && !comparison.sameArea && <div className="field-ops-inline-warning" style={{ marginBottom: 10 }}><Icon name="warning" size={15}/><span>A base agronômica é equivalente, mas a área congelada mudou entre cenários. A diferença por hectare é comparável; a diferença de custo total não é.</span></div>}
          {comparison.directCostComparison && <div className="agro-message success" style={{ marginBottom: 10 }}><Icon name="check" size={14}/><span>Base agronômica equivalente confirmada. As diferenças por hectare usam o primeiro cenário selecionado apenas como referência matemática, nunca como recomendação.</span></div>}

          <div className="review-grid">{selectedSnapshots.map((snapshot, index) => {
            const metrics = comparisonRows.get(snapshot.id);
            if (!metrics) return null;
            const physicalRate = snapshot.simulationMode === "LIME"
              ? `${number(metrics.productDoseTonPerHa, 4)} t/ha`
              : `${number(metrics.totalRateKgPerHa)} kg/ha`;
            return <div className="review-summary" key={snapshot.id}>
              <span>{index === 0 ? "Referência · " : "Cenário · "}{snapshot.label || modeLabel(snapshot.simulationMode)}</span>
              <strong>{money(metrics.costPerHa)}/ha</strong>
              <small>{comparison.directCostComparison ? `Diferença vs. referência: ${signedMoney(metrics.costPerHaDeltaFromReference)}/ha` : "Diferença bloqueada: base agronômica distinta."}</small>
              <small>{productsLabel(snapshot)}</small>
              <small>Dose comercial total: {physicalRate} · produto no talhão: {number(metrics.totalProductTon, 4)} t</small>
              <small>Área congelada: {number(metrics.areaHa, 4)} ha · custo total: {money(metrics.totalCost)}</small>
              <small>{comparison.directTotalComparison ? `Diferença total vs. referência: ${signedMoney(metrics.totalCostDeltaFromReference)}` : "Diferença total não calculada sem base e área equivalentes."}</small>
              <small>{metrics.constraintViolationCount > 0 ? `${metrics.constraintViolationCount} alerta(s) de limite operacional cadastrado.` : "Sem alerta de limite operacional cadastrado."}</small>
            </div>;
          })}</div>
        </>}
      </div>}
    </div>
  );
}