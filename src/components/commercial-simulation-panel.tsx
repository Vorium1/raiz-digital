"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/ui";

type Nutrient = "N" | "P2O5" | "K2O" | "S" | "Ca" | "Mg";
type Product = {
  id: string;
  code: string;
  name: string;
  kind: "FERTILIZER" | "LIMESTONE" | "CORRECTIVE";
  guaranteesPercent: Partial<Record<Nutrient, number>>;
  prntPercent: number | null;
  pricePerTon: number | null;
  minRateKgPerHa: number | null;
  maxRateKgPerHa: number | null;
};
type TargetState = {
  nutrientTargetsKgPerHa: Partial<Record<Nutrient, number>>;
  limingRequirementTonPerHaPrnt100: number | null;
  blockers: Array<{ code: string; inputType: string; reason: string }>;
  sourceRows: Array<{ inputType: string; canonicalTarget: Nutrient | "LIME_PRNT100"; quantity: number; unit: string }>;
};
type Workspace = { analysisId: string; analysisCode: string; areaHa: number; targets: TargetState; products: Product[] };
type Mode = "SINGLE" | "PK_PAIR" | "LIME";

type Simulation = {
  mode: Mode;
  result: any;
  driverNutrient?: Nutrient;
  targetKgPerHa?: number;
  productId?: string;
  productAId?: string;
  productBId?: string;
};

const NUTRIENT_ORDER: Nutrient[] = ["N", "P2O5", "K2O", "S", "Ca", "Mg"];

function formatNumber(value: number | null | undefined, digits = 2) {
  return value == null ? "—" : value.toLocaleString("pt-BR", { maximumFractionDigits: digits });
}
function formatMoney(value: number | null | undefined) {
  return value == null ? "—" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function productLabel(product: Product) {
  const guarantees = NUTRIENT_ORDER.flatMap((nutrient) => product.guaranteesPercent[nutrient] == null ? [] : [`${nutrient} ${product.guaranteesPercent[nutrient]}%`]);
  if (product.prntPercent != null) guarantees.push(`PRNT ${product.prntPercent}%`);
  return `${product.name} (${product.code})${guarantees.length ? ` · ${guarantees.join(" · ")}` : ""}`;
}

function TargetComparison({ comparison }: { comparison: Record<string, { targetKgPerHa: number; suppliedKgPerHa: number; differenceKgPerHa: number }> | undefined }) {
  if (!comparison || Object.keys(comparison).length === 0) return null;
  return <div className="field-ops-list" style={{ marginTop: 10 }}>{Object.entries(comparison).map(([nutrient, row]) => (
    <div key={nutrient} className="field-ops-list-row">
      <span><strong>{nutrient}</strong><small>Alvo {formatNumber(row.targetKgPerHa)} kg/ha · fornecido {formatNumber(row.suppliedKgPerHa)} kg/ha</small></span>
      <StatusBadge tone={Math.abs(row.differenceKgPerHa) <= 0.1 ? "success" : row.differenceKgPerHa > 0 ? "review" : "danger"}>{row.differenceKgPerHa > 0 ? "+" : ""}{formatNumber(row.differenceKgPerHa)} kg/ha</StatusBadge>
    </div>
  ))}</div>;
}

export function CommercialSimulationPanel({ analysisId }: { analysisId: string }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("SINGLE");
  const [driverNutrient, setDriverNutrient] = useState<Nutrient | "">("");
  const [productId, setProductId] = useState("");
  const [productAId, setProductAId] = useState("");
  const [productBId, setProductBId] = useState("");
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "danger" | "success"; text: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/analyses/${analysisId}/commercial-simulation`, { cache: "no-store" })
      .then(async (response) => ({ response, data: await response.json().catch(() => ({})) }))
      .then(({ response, data }) => {
        if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar a camada comercial.");
        setWorkspace(data.workspace as Workspace);
      })
      .catch((error) => setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao carregar a camada comercial." }))
      .finally(() => setLoading(false));
  }, [analysisId]);

  const fertilizers = useMemo(() => workspace?.products.filter((product) => product.kind === "FERTILIZER") ?? [], [workspace]);
  const limestones = useMemo(() => workspace?.products.filter((product) => product.kind === "LIMESTONE") ?? [], [workspace]);
  const availableNutrients = useMemo(() => NUTRIENT_ORDER.filter((nutrient) => workspace?.targets.nutrientTargetsKgPerHa[nutrient] != null), [workspace]);
  const canPk = workspace?.targets.nutrientTargetsKgPerHa.P2O5 != null && workspace?.targets.nutrientTargetsKgPerHa.K2O != null && fertilizers.length >= 2;
  const canLime = workspace?.targets.limingRequirementTonPerHaPrnt100 != null && limestones.length > 0;

  useEffect(() => {
    if (!workspace) return;
    if (availableNutrients.length > 0) {
      setMode("SINGLE");
      setDriverNutrient((current) => current || availableNutrients[0]);
      setProductId((current) => current || fertilizers[0]?.id || "");
    } else if (canLime) {
      setMode("LIME");
      setProductId(limestones[0]?.id || "");
    }
  }, [workspace, availableNutrients, fertilizers, limestones, canLime]);

  function selectMode(next: Mode) {
    setMode(next); setSimulation(null); setMessage(null);
    if (next === "SINGLE") {
      setDriverNutrient(availableNutrients[0] ?? ""); setProductId(fertilizers[0]?.id ?? "");
    } else if (next === "PK_PAIR") {
      setProductAId(fertilizers[0]?.id ?? ""); setProductBId(fertilizers[1]?.id ?? "");
    } else setProductId(limestones[0]?.id ?? "");
  }

  async function simulate() {
    setBusy(true); setMessage(null); setSimulation(null);
    try {
      const payload = mode === "SINGLE"
        ? { mode, driverNutrient, productId }
        : mode === "PK_PAIR"
          ? { mode, productAId, productBId }
          : { mode, productId };
      const response = await fetch(`/api/analyses/${analysisId}/commercial-simulation`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível calcular a simulação.");
      setSimulation(data.simulation as Simulation);
      setMessage({ tone: "success", text: "Simulação calculada. Nenhuma recomendação oficial foi alterada." });
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao simular." });
    } finally { setBusy(false); }
  }

  if (loading) return <section className="card"><div className="agro-loading"><Icon name="clock" size={14}/>Carregando camada comercial…</div></section>;
  if (!workspace) return message ? <section className="card"><div className="agro-message danger"><Icon name="warning" size={14}/><span>{message.text}</span></div></section> : null;

  const noRecognizedTarget = availableNutrients.length === 0 && workspace.targets.limingRequirementTonPerHaPrnt100 == null;

  return (
    <section className="card">
      <div className="card-header"><div><span className="eyebrow">CAMADA COMERCIAL · OPCIONAL</span><h2>Converter necessidade em produto e custo</h2></div><StatusBadge tone="info">Simulação</StatusBadge></div>
      <div className="review-actions">
        <p className="report-empty-note" style={{ marginTop: 0 }}>A necessidade agronômica continua sendo a referência. Aqui você escolhe explicitamente produtos reais do catálogo para ver kg/ha, toneladas e custo. A RAIZ não escolhe marca nem altera dose agronômica nesta etapa.</p>

        {workspace.targets.sourceRows.length > 0 && <div className="review-grid" style={{ marginBottom: 12 }}>{workspace.targets.sourceRows.map((row) => (
          <div className="review-summary" key={`${row.inputType}-${row.canonicalTarget}`}><span>{row.canonicalTarget}</span><strong>{formatNumber(row.quantity)} {row.unit}</strong><small>Recomendação oficial corrente · origem {row.inputType}</small></div>
        ))}</div>}

        {workspace.targets.blockers.length > 0 && <details className="agro-history" style={{ marginBottom: 12 }}><summary>{workspace.targets.blockers.length} recomendação(ões) não usada(s) na camada comercial</summary><ul>{workspace.targets.blockers.map((blocker, index) => <li key={`${blocker.inputType}-${index}`}><strong>{blocker.inputType}</strong> · {blocker.reason}</li>)}</ul></details>}

        {noRecognizedTarget ? <p className="report-empty-note">Ainda não há uma recomendação oficial corrente em formato físico inequívoco (nutriente em kg/ha ou calcário PRNT100 em t/ha). A simulação fica bloqueada em vez de inferir unidade ou produto.</p> : workspace.products.length === 0 ? <p className="report-empty-note">Cadastre ao menos um insumo real em Configurações → Insumos comerciais. Fórmula, PRNT e preço não são preenchidos automaticamente.</p> : <>
          <div className="review-grid">
            <label className="review-summary"><span>Tipo de simulação</span><select value={mode} onChange={(event) => selectMode(event.target.value as Mode)}><option value="SINGLE" disabled={availableNutrients.length === 0 || fertilizers.length === 0}>Um produto por nutriente-guia</option><option value="PK_PAIR" disabled={!canPk}>Combinação exata P2O5 + K2O</option><option value="LIME" disabled={!canLime}>Calcário pelo PRNT real</option></select></label>
            <div className="review-summary"><span>Área</span><strong>{formatNumber(workspace.areaHa)} ha</strong><small>Total do talhão calculado sem arredondar a necessidade agronômica.</small></div>
          </div>

          {mode === "SINGLE" && <div className="review-grid" style={{ marginTop: 8 }}>
            <label className="review-summary"><span>Nutriente-guia</span><select value={driverNutrient} onChange={(event) => { setDriverNutrient(event.target.value as Nutrient); setSimulation(null); }}>{availableNutrients.map((nutrient) => <option key={nutrient} value={nutrient}>{nutrient} · alvo {formatNumber(workspace.targets.nutrientTargetsKgPerHa[nutrient])} kg/ha</option>)}</select></label>
            <label className="review-summary"><span>Produto escolhido</span><select value={productId} onChange={(event) => { setProductId(event.target.value); setSimulation(null); }}>{fertilizers.map((product) => <option key={product.id} value={product.id}>{productLabel(product)}</option>)}</select></label>
          </div>}

          {mode === "PK_PAIR" && <div className="review-grid" style={{ marginTop: 8 }}>
            <label className="review-summary"><span>Produto A</span><select value={productAId} onChange={(event) => { setProductAId(event.target.value); setSimulation(null); }}>{fertilizers.map((product) => <option key={product.id} value={product.id}>{productLabel(product)}</option>)}</select></label>
            <label className="review-summary"><span>Produto B</span><select value={productBId} onChange={(event) => { setProductBId(event.target.value); setSimulation(null); }}>{fertilizers.map((product) => <option key={product.id} value={product.id}>{productLabel(product)}</option>)}</select></label>
          </div>}

          {mode === "LIME" && <div className="review-grid" style={{ marginTop: 8 }}>
            <label className="review-summary"><span>Calcário escolhido</span><select value={productId} onChange={(event) => { setProductId(event.target.value); setSimulation(null); }}>{limestones.map((product) => <option key={product.id} value={product.id}>{productLabel(product)}</option>)}</select></label>
            <div className="review-summary"><span>Necessidade equivalente</span><strong>{formatNumber(workspace.targets.limingRequirementTonPerHaPrnt100)} t/ha PRNT100</strong><small>A dose real será corrigida pelo PRNT cadastrado do produto.</small></div>
          </div>}

          <div className="narrative-review-actions" style={{ marginTop: 10 }}><button className="button secondary" disabled={busy || (mode === "SINGLE" && (!driverNutrient || !productId)) || (mode === "PK_PAIR" && (!productAId || !productBId || productAId === productBId)) || (mode === "LIME" && !productId)} onClick={() => void simulate()}>{busy ? "Calculando…" : "Simular produto e custo"}</button></div>
        </>}

        {message && <div className={`agro-message ${message.tone}`} style={{ marginTop: 12 }}><Icon name={message.tone === "success" ? "check" : "warning"} size={14}/><span>{message.text}</span></div>}

        {simulation?.mode === "SINGLE" && <div className="narrative-block" style={{ marginTop: 12 }}><h4>Resultado comercial</h4><div className="review-grid"><div className="review-summary"><span>Dose do produto</span><strong>{formatNumber(simulation.result.rateKgPerHa)} kg/ha</strong></div><div className="review-summary"><span>Produto no talhão</span><strong>{formatNumber(simulation.result.totalProductTon, 4)} t</strong></div><div className="review-summary"><span>Custo</span><strong>{formatMoney(simulation.result.costPerHa)}/ha</strong><small>Total {formatMoney(simulation.result.totalCost)}</small></div><div className="review-summary"><span>Limites operacionais</span><strong>{simulation.result.constraintsSatisfied ? "Atendidos" : "Fora do cadastro"}</strong></div></div><TargetComparison comparison={simulation.result.targetComparison}/>{simulation.result.constraintViolations?.length > 0 && <div className="field-ops-inline-warning" style={{ marginTop: 10 }}><Icon name="warning" size={15}/><span>{simulation.result.constraintViolations.join(" ")}</span></div>}</div>}

        {simulation?.mode === "PK_PAIR" && <div className="narrative-block" style={{ marginTop: 12 }}><h4>Combinação P/K</h4><div className="review-grid"><div className="review-summary"><span>Produto A</span><strong>{formatNumber(simulation.result.productA.rateKgPerHa)} kg/ha</strong><small>{simulation.result.productA.product.name}</small></div><div className="review-summary"><span>Produto B</span><strong>{formatNumber(simulation.result.productB.rateKgPerHa)} kg/ha</strong><small>{simulation.result.productB.product.name}</small></div><div className="review-summary"><span>Custo combinado</span><strong>{formatMoney(simulation.result.costPerHa)}/ha</strong><small>Total {formatMoney(simulation.result.totalCost)}</small></div></div><TargetComparison comparison={simulation.result.targetComparison}/>{[...(simulation.result.productA.constraintViolations ?? []), ...(simulation.result.productB.constraintViolations ?? [])].length > 0 && <div className="field-ops-inline-warning" style={{ marginTop: 10 }}><Icon name="warning" size={15}/><span>{[...(simulation.result.productA.constraintViolations ?? []), ...(simulation.result.productB.constraintViolations ?? [])].join(" ")}</span></div>}</div>}

        {simulation?.mode === "LIME" && <div className="narrative-block" style={{ marginTop: 12 }}><h4>Conversão por PRNT real</h4><div className="review-grid"><div className="review-summary"><span>Dose do produto</span><strong>{formatNumber(simulation.result.productDoseTonPerHa, 4)} t/ha</strong><small>{formatNumber(simulation.result.productDoseKgPerHa)} kg/ha</small></div><div className="review-summary"><span>Total no talhão</span><strong>{formatNumber(simulation.result.totalProductTon, 4)} t</strong></div><div className="review-summary"><span>Custo</span><strong>{formatMoney(simulation.result.costPerHa)}/ha</strong><small>Total {formatMoney(simulation.result.totalCost)}</small></div><div className="review-summary"><span>PRNT do produto</span><strong>{formatNumber(simulation.result.productPrntPercent)}%</strong></div></div>{simulation.result.constraintViolations?.length > 0 && <div className="field-ops-inline-warning" style={{ marginTop: 10 }}><Icon name="warning" size={15}/><span>{simulation.result.constraintViolations.join(" ")}</span></div>}</div>}
      </div>
    </section>
  );
}
