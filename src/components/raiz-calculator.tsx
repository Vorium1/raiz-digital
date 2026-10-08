"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/ui";
import {
  computeSingleProductRateFromNutrient,
  convertCommercialLimeDoseToPrnt100,
  convertLimingRequirementToCommercialProduct,
  convertNutrientBasis,
  evaluateCommercialProductRate,
  solveTwoProductPkPlan,
  type CommercialFertilizerProduct,
  type CommercialNutrient,
  type NutrientBasis,
} from "@/domain/commercial-input-engine";
import type { CommercialInputProduct } from "@/lib/repositories/commercial-input-products";

type Mode = "NUTRIENT_TO_PRODUCT" | "PRODUCT_TO_NUTRIENTS" | "PK_PAIR" | "LIME" | "CHEMICAL";
type ProductSource = "CATALOG" | "MANUAL";
type LimeDirection = "PRNT100_TO_PRODUCT" | "PRODUCT_TO_PRNT100";

const NUTRIENTS: CommercialNutrient[] = ["N", "P2O5", "K2O", "S", "Ca", "Mg"];

function parseNumber(value: string) {
  if (!value.trim()) return null;
  const normalized = value.trim().replace(",", ".");
  // Keep a filled invalid value distinct from an optional blank; the shared motor rejects NaN.
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}

function formatNumber(value: number | null | undefined, digits = 2) {
  return value == null ? "—" : value.toLocaleString("pt-BR", { maximumFractionDigits: digits });
}

function formatMoney(value: number | null | undefined) {
  return value == null ? "—" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function toEngineProduct(product: CommercialInputProduct): CommercialFertilizerProduct {
  return {
    code: product.code,
    name: product.name,
    guaranteesPercent: product.guaranteesPercent,
    pricePerTon: product.pricePerTon,
    minRateKgPerHa: product.minRateKgPerHa,
    maxRateKgPerHa: product.maxRateKgPerHa,
  };
}

function ResultError({ message }: { message: string }) {
  return <div className="agro-message danger" role="alert"><Icon name="warning" size={15}/><span>{message}</span></div>;
}

function ConstraintWarnings({ violations, productName }: { violations: string[]; productName?: string }) {
  if (!violations.length) return null;
  return <div className="agro-message waiting" role="status"><div><strong>Limites operacionais{productName ? ` · ${productName}` : ""}</strong>{violations.map((violation) => <p key={violation}>{violation}</p>)}</div></div>;
}

export function RaizCalculator({
  products,
  prefill,
}: {
  products: CommercialInputProduct[];
  prefill?: { nutrient?: CommercialNutrient; targetKgPerHa?: number; areaHa?: number; mode?: Mode; limeRequirementTonHaPrnt100?: number };
}) {
  const fertilizers = useMemo(() => products.filter((product) => product.active && product.kind === "FERTILIZER"), [products]);
  const limestones = useMemo(() => products.filter((product) => product.active && product.kind === "LIMESTONE"), [products]);

  const [mode, setMode] = useState<Mode>(prefill?.mode ?? "NUTRIENT_TO_PRODUCT");
  const [source, setSource] = useState<ProductSource>(fertilizers.length ? "CATALOG" : "MANUAL");
  const [selectedProductId, setSelectedProductId] = useState(fertilizers[0]?.id ?? "");
  const [selectedProductBId, setSelectedProductBId] = useState(fertilizers[1]?.id ?? "");
  const [nutrient, setNutrient] = useState<CommercialNutrient>(prefill?.nutrient ?? "K2O");
  const [target, setTarget] = useState(prefill?.targetKgPerHa?.toString() ?? "");
  const [rate, setRate] = useState("");
  const [area, setArea] = useState(prefill?.areaHa?.toString() ?? "");
  const [pkP, setPkP] = useState("");
  const [pkK, setPkK] = useState("");

  const [manualName, setManualName] = useState("Produto manual");
  const [manualPrice, setManualPrice] = useState("");
  const [manualGuarantees, setManualGuarantees] = useState<Record<CommercialNutrient, string>>({
    N: "", P2O5: "", K2O: "", S: "", Ca: "", Mg: "",
  });

  const [limeSource, setLimeSource] = useState<ProductSource>(limestones.length ? "CATALOG" : "MANUAL");
  const [limeProductId, setLimeProductId] = useState(limestones[0]?.id ?? "");
  const [limePrnt, setLimePrnt] = useState("");
  const [limePrice, setLimePrice] = useState("");
  const [limeRequirement, setLimeRequirement] = useState(prefill?.limeRequirementTonHaPrnt100?.toString() ?? "");
  const [limePhysicalDose, setLimePhysicalDose] = useState("");
  const [limeDirection, setLimeDirection] = useState<LimeDirection>("PRNT100_TO_PRODUCT");

  const [chemicalMode, setChemicalMode] = useState<"P_TO_P2O5" | "P2O5_TO_P" | "K_TO_K2O" | "K2O_TO_K">("P_TO_P2O5");
  const [chemicalValue, setChemicalValue] = useState("");

  const currentProduct = useMemo(() => {
    if (source === "CATALOG") {
      const found = fertilizers.find((product) => product.id === selectedProductId);
      return found ? toEngineProduct(found) : null;
    }
    const guarantees = Object.fromEntries(
      NUTRIENTS.flatMap((key) => {
        const value = parseNumber(manualGuarantees[key]);
        return value == null ? [] : [[key, value]];
      }),
    ) as Partial<Record<CommercialNutrient, number>>;
    return {
      code: "MANUAL",
      name: manualName.trim() || "Produto manual",
      guaranteesPercent: guarantees,
      pricePerTon: parseNumber(manualPrice),
    } satisfies CommercialFertilizerProduct;
  }, [source, fertilizers, selectedProductId, manualGuarantees, manualName, manualPrice]);

  const areaNumber = parseNumber(area);

  const nutrientResult = useMemo(() => {
    if (mode !== "NUTRIENT_TO_PRODUCT" || !currentProduct) return null;
    const targetNumber = parseNumber(target);
    if (targetNumber == null) return null;
    try {
      return { value: computeSingleProductRateFromNutrient({
        product: currentProduct,
        driverNutrient: nutrient,
        targetKgPerHa: targetNumber,
        areaHa: areaNumber,
      }), error: null };
    } catch (error) {
      return { value: null, error: error instanceof Error ? error.message : "Não foi possível calcular." };
    }
  }, [mode, currentProduct, target, nutrient, areaNumber]);

  const supplyResult = useMemo(() => {
    if (mode !== "PRODUCT_TO_NUTRIENTS" || !currentProduct) return null;
    const rateNumber = parseNumber(rate);
    if (rateNumber == null) return null;
    try {
      return { value: evaluateCommercialProductRate({
        product: currentProduct,
        rateKgPerHa: rateNumber,
        areaHa: areaNumber,
      }), error: null };
    } catch (error) {
      return { value: null, error: error instanceof Error ? error.message : "Não foi possível calcular." };
    }
  }, [mode, currentProduct, rate, areaNumber]);

  const pkResult = useMemo(() => {
    if (mode !== "PK_PAIR") return null;
    const productA = fertilizers.find((product) => product.id === selectedProductId);
    const productB = fertilizers.find((product) => product.id === selectedProductBId);
    const p = parseNumber(pkP);
    const k = parseNumber(pkK);
    if (!productA || !productB || p == null || k == null) return null;
    try {
      return { value: solveTwoProductPkPlan({
        productA: toEngineProduct(productA),
        productB: toEngineProduct(productB),
        targetP2O5KgPerHa: p,
        targetK2OKgPerHa: k,
        areaHa: areaNumber,
      }), error: null };
    } catch (error) {
      return { value: null, error: error instanceof Error ? error.message : "Não foi possível combinar os produtos." };
    }
  }, [mode, fertilizers, selectedProductId, selectedProductBId, pkP, pkK, areaNumber]);

  const limeResult = useMemo(() => {
    if (mode !== "LIME") return null;
    const catalog = limeSource === "CATALOG" ? limestones.find((product) => product.id === limeProductId) : null;
    if (limeSource === "CATALOG" && (!catalog || catalog.prntPercent == null)) {
      return { value: null, reverse: limeDirection === "PRODUCT_TO_PRNT100", error: "O calcário selecionado não possui PRNT cadastrado. Informe o PRNT na opção manual ou revise o catálogo." };
    }
    const prnt = limeSource === "CATALOG" ? catalog!.prntPercent : parseNumber(limePrnt);
    const price = limeSource === "CATALOG" ? catalog!.pricePerTon : parseNumber(limePrice);
    if (prnt == null) return null;
    try {
      if (limeDirection === "PRNT100_TO_PRODUCT") {
        const requirement = parseNumber(limeRequirement);
        if (requirement == null) return null;
        return { value: convertLimingRequirementToCommercialProduct({
          requirementTonPerHaPrnt100: requirement,
          productPrntPercent: prnt,
          areaHa: areaNumber,
          pricePerTon: price,
        }), reverse: false as const, error: null };
      }
      const physical = parseNumber(limePhysicalDose);
      if (physical == null) return null;
      return { value: convertCommercialLimeDoseToPrnt100({
        productDoseTonPerHa: physical,
        productPrntPercent: prnt,
        areaHa: areaNumber,
        pricePerTon: price,
      }), reverse: true as const, error: null };
    } catch (error) {
      return { value: null, reverse: limeDirection === "PRODUCT_TO_PRNT100", error: error instanceof Error ? error.message : "Não foi possível converter o calcário." };
    }
  }, [mode, limeSource, limestones, limeProductId, limePrnt, limePrice, limeRequirement, limePhysicalDose, limeDirection, areaNumber]);

  const chemicalResult = useMemo(() => {
    if (mode !== "CHEMICAL") return null;
    const value = parseNumber(chemicalValue);
    if (value == null) return null;
    const [from, to] = chemicalMode.split("_TO_") as [NutrientBasis, NutrientBasis];
    try {
      return { value: convertNutrientBasis(value, from, to), from, to, error: null };
    } catch (error) {
      return { value: null, from, to, error: error instanceof Error ? error.message : "Não foi possível converter." };
    }
  }, [mode, chemicalMode, chemicalValue]);

  return (
    <section className="card raiz-calculator">
      <div className="card-header">
        <div><span className="eyebrow">CALCULADORA RAIZ</span><h2>Conversões de fertilizantes e corretivos</h2></div>
        <StatusBadge tone="info">Simulação</StatusBadge>
      </div>
      <div className="review-actions">
        <p className="report-empty-note" style={{ marginTop: 0 }}>Esta ferramenta converte quantidades e produtos. Ela não altera análise, prescrição ou relatório oficial automaticamente.</p>

        <div className="review-grid">
          <label className="review-summary"><span>Tipo de cálculo</span>
            <select value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
              <option value="NUTRIENT_TO_PRODUCT">Nutriente → produto</option>
              <option value="PRODUCT_TO_NUTRIENTS">Produto → nutrientes</option>
              <option value="PK_PAIR">Dois produtos para P2O5 + K2O</option>
              <option value="LIME">Calcário / PRNT</option>
              <option value="CHEMICAL">P ↔ P2O5 / K ↔ K2O</option>
            </select>
          </label>
          {mode !== "CHEMICAL" && <label className="review-summary"><span>Área do talhão (ha)</span><input value={area} onChange={(event) => setArea(event.target.value)} inputMode="decimal" placeholder="Opcional"/></label>}
        </div>

        {(mode === "NUTRIENT_TO_PRODUCT" || mode === "PRODUCT_TO_NUTRIENTS") && <>
          <div className="review-grid" style={{ marginTop: 10 }}>
            <label className="review-summary"><span>Fonte do produto</span><select value={source} onChange={(event) => setSource(event.target.value as ProductSource)}><option value="CATALOG" disabled={fertilizers.length === 0}>Catálogo da empresa</option><option value="MANUAL">Produto manual, sem salvar</option></select></label>
            {source === "CATALOG" ? <label className="review-summary"><span>Produto</span><select value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)}>{fertilizers.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.code}</option>)}</select></label>
            : <label className="review-summary"><span>Nome de referência</span><input value={manualName} onChange={(event) => setManualName(event.target.value)}/></label>}
          </div>
          {source === "MANUAL" && <div className="narrative-block" style={{ marginTop: 10 }}>
            <h4>Garantias informadas (%)</h4>
            <div className="review-grid">
              {NUTRIENTS.map((key) => <label className="review-summary" key={key}><span>{key}</span><input value={manualGuarantees[key]} onChange={(event) => setManualGuarantees((current) => ({ ...current, [key]: event.target.value }))} inputMode="decimal" placeholder="—"/></label>)}
              <label className="review-summary"><span>Preço (R$/t)</span><input value={manualPrice} onChange={(event) => setManualPrice(event.target.value)} inputMode="decimal" placeholder="Opcional"/></label>
            </div>
            <small className="audit-hint"><Icon name="shield" size={12}/>Produto manual é usado apenas nesta simulação e não entra no catálogo.</small>
          </div>}
        </>}

        {mode === "NUTRIENT_TO_PRODUCT" && <div className="review-grid" style={{ marginTop: 10 }}>
          <label className="review-summary"><span>Nutriente-guia</span><select value={nutrient} onChange={(event) => setNutrient(event.target.value as CommercialNutrient)}>{NUTRIENTS.map((key) => <option value={key} key={key}>{key}</option>)}</select></label>
          <label className="review-summary"><span>Necessidade (kg/ha)</span><input value={target} onChange={(event) => setTarget(event.target.value)} inputMode="decimal"/></label>
        </div>}

        {mode === "PRODUCT_TO_NUTRIENTS" && <div className="review-grid" style={{ marginTop: 10 }}><label className="review-summary"><span>Dose do produto (kg/ha)</span><input value={rate} onChange={(event) => setRate(event.target.value)} inputMode="decimal"/></label></div>}

        {mode === "PK_PAIR" && <>
          {fertilizers.length < 2 ? <p className="report-empty-note">Cadastre ao menos dois fertilizantes no catálogo da empresa para resolver P2O5 + K2O em conjunto.</p> : <div className="review-grid" style={{ marginTop: 10 }}>
            <label className="review-summary"><span>Produto A</span><select value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)}>{fertilizers.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.code}</option>)}</select></label>
            <label className="review-summary"><span>Produto B</span><select value={selectedProductBId} onChange={(event) => setSelectedProductBId(event.target.value)}>{fertilizers.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.code}</option>)}</select></label>
            <label className="review-summary"><span>Alvo P2O5 (kg/ha)</span><input value={pkP} onChange={(event) => setPkP(event.target.value)} inputMode="decimal"/></label>
            <label className="review-summary"><span>Alvo K2O (kg/ha)</span><input value={pkK} onChange={(event) => setPkK(event.target.value)} inputMode="decimal"/></label>
          </div>}
        </>}

        {mode === "LIME" && <div className="review-grid" style={{ marginTop: 10 }}>
          <label className="review-summary"><span>Sentido</span><select value={limeDirection} onChange={(event) => setLimeDirection(event.target.value as LimeDirection)}><option value="PRNT100_TO_PRODUCT">PRNT100 → produto real</option><option value="PRODUCT_TO_PRNT100">Produto real → equivalente PRNT100</option></select></label>
          <label className="review-summary"><span>Fonte do calcário</span><select value={limeSource} onChange={(event) => setLimeSource(event.target.value as ProductSource)}><option value="CATALOG" disabled={limestones.length === 0}>Catálogo da empresa</option><option value="MANUAL">PRNT manual, sem salvar</option></select></label>
          {limeSource === "CATALOG" ? <label className="review-summary"><span>Calcário</span><select value={limeProductId} onChange={(event) => setLimeProductId(event.target.value)}>{limestones.map((product) => <option key={product.id} value={product.id}>{product.name} · PRNT {formatNumber(product.prntPercent)}%</option>)}</select></label> : <>
            <label className="review-summary"><span>PRNT (%)</span><input value={limePrnt} onChange={(event) => setLimePrnt(event.target.value)} inputMode="decimal"/></label>
            <label className="review-summary"><span>Preço (R$/t)</span><input value={limePrice} onChange={(event) => setLimePrice(event.target.value)} inputMode="decimal" placeholder="Opcional"/></label>
          </>}
          {limeDirection === "PRNT100_TO_PRODUCT" ? <label className="review-summary"><span>Necessidade PRNT100 (t/ha)</span><input value={limeRequirement} onChange={(event) => setLimeRequirement(event.target.value)} inputMode="decimal"/></label> : <label className="review-summary"><span>Dose física aplicada (t/ha)</span><input value={limePhysicalDose} onChange={(event) => setLimePhysicalDose(event.target.value)} inputMode="decimal"/></label>}
        </div>}

        {mode === "CHEMICAL" && <div className="review-grid" style={{ marginTop: 10 }}>
          <label className="review-summary"><span>Conversão</span><select value={chemicalMode} onChange={(event) => setChemicalMode(event.target.value as typeof chemicalMode)}><option value="P_TO_P2O5">P → P2O5</option><option value="P2O5_TO_P">P2O5 → P</option><option value="K_TO_K2O">K → K2O</option><option value="K2O_TO_K">K2O → K</option></select></label>
          <label className="review-summary"><span>Quantidade (kg/ha)</span><input value={chemicalValue} onChange={(event) => setChemicalValue(event.target.value)} inputMode="decimal"/></label>
        </div>}

        <div className="narrative-block" style={{ marginTop: 16 }} aria-live="polite">
          <h4>Resultado</h4>
          {nutrientResult?.error && <ResultError message={nutrientResult.error}/>}
          {nutrientResult?.value && <>
            <ConstraintWarnings violations={nutrientResult.value.constraintViolations}/>
            <div className="review-grid"><div className="review-summary"><span>Dose do produto</span><strong>{formatNumber(nutrientResult.value.rateKgPerHa, 4)} kg/ha</strong></div><div className="review-summary"><span>Total do talhão</span><strong>{formatNumber(nutrientResult.value.totalProductTon, 4)} t</strong></div><div className="review-summary"><span>Custo</span><strong>{formatMoney(nutrientResult.value.costPerHa)}/ha</strong><small>Total {formatMoney(nutrientResult.value.totalCost)}</small></div></div>
            <div className="field-ops-list" style={{ marginTop: 10 }}>{Object.entries(nutrientResult.value.suppliedKgPerHa).map(([key, value]) => <div className="field-ops-list-row" key={key}><span><strong>{key}</strong><small>Fornecido pelo produto</small></span><strong>{formatNumber(value, 4)} kg/ha</strong></div>)}</div>
          </>}
          {supplyResult?.error && <ResultError message={supplyResult.error}/>}
          {supplyResult?.value && <>
            <ConstraintWarnings violations={supplyResult.value.constraintViolations}/>
            <div className="review-grid"><div className="review-summary"><span>Dose aplicada</span><strong>{formatNumber(supplyResult.value.rateKgPerHa, 4)} kg/ha</strong></div><div className="review-summary"><span>Total do talhão</span><strong>{formatNumber(supplyResult.value.totalProductTon, 4)} t</strong></div><div className="review-summary"><span>Custo</span><strong>{formatMoney(supplyResult.value.costPerHa)}/ha</strong><small>Total {formatMoney(supplyResult.value.totalCost)}</small></div></div>
            <div className="field-ops-list" style={{ marginTop: 10 }}>{Object.entries(supplyResult.value.suppliedKgPerHa).map(([key, value]) => <div className="field-ops-list-row" key={key}><span><strong>{key}</strong></span><strong>{formatNumber(value, 4)} kg/ha</strong></div>)}</div>
          </>}
          {pkResult?.error && <ResultError message={pkResult.error}/>}
          {pkResult?.value && <>
            <ConstraintWarnings violations={pkResult.value.productA.constraintViolations} productName={pkResult.value.productA.product.name}/>
            <ConstraintWarnings violations={pkResult.value.productB.constraintViolations} productName={pkResult.value.productB.product.name}/>
            <div className="review-grid">
              <div className="review-summary"><span>Total do produto A no talhão</span><strong>{formatNumber(pkResult.value.productA.totalProductTon, 4)} t</strong></div>
              <div className="review-summary"><span>Total do produto B no talhão</span><strong>{formatNumber(pkResult.value.productB.totalProductTon, 4)} t</strong></div>
            </div>
            <div className="field-ops-list" style={{ marginTop: 10 }}>{Object.entries(pkResult.value.targetComparison).map(([key, comparison]) => comparison && <div className="field-ops-list-row" key={key}><span><strong>{key}</strong><small>Alvo {formatNumber(comparison.targetKgPerHa, 4)} kg/ha · Fornecido {formatNumber(comparison.suppliedKgPerHa, 4)} kg/ha</small></span><span>Diferença {formatNumber(comparison.differenceKgPerHa, 4)} kg/ha</span></div>)}</div>
            <div className="review-grid"><div className="review-summary"><span>Produto A</span><strong>{formatNumber(pkResult.value.productA.rateKgPerHa, 4)} kg/ha</strong><small>{pkResult.value.productA.product.name}</small></div><div className="review-summary"><span>Produto B</span><strong>{formatNumber(pkResult.value.productB.rateKgPerHa, 4)} kg/ha</strong><small>{pkResult.value.productB.product.name}</small></div><div className="review-summary"><span>Custo combinado</span><strong>{formatMoney(pkResult.value.costPerHa)}/ha</strong><small>Total {formatMoney(pkResult.value.totalCost)}</small></div></div>
            <div className="field-ops-list" style={{ marginTop: 10 }}>{Object.entries(pkResult.value.combinedSuppliedKgPerHa).map(([key, value]) => <div className="field-ops-list-row" key={key}><span><strong>{key}</strong><small>Entrega combinada</small></span><strong>{formatNumber(value, 4)} kg/ha</strong></div>)}</div>
          </>}
          {limeResult?.error && <ResultError message={limeResult.error}/>}
          {limeResult?.value && !limeResult.reverse && "productDoseKgPerHa" in limeResult.value && <div className="review-grid"><div className="review-summary"><span>Dose do produto</span><strong>{formatNumber(limeResult.value.productDoseTonPerHa, 4)} t/ha</strong><small>{formatNumber(limeResult.value.productDoseKgPerHa, 2)} kg/ha</small></div><div className="review-summary"><span>Total do talhão</span><strong>{formatNumber(limeResult.value.totalProductTon, 4)} t</strong></div><div className="review-summary"><span>Custo</span><strong>{formatMoney(limeResult.value.costPerHa)}/ha</strong><small>Total {formatMoney(limeResult.value.totalCost)}</small></div></div>}
          {limeResult?.value && limeResult.reverse && "equivalentPrnt100TonPerHa" in limeResult.value && <div className="review-grid"><div className="review-summary"><span>Equivalente PRNT100</span><strong>{formatNumber(limeResult.value.equivalentPrnt100TonPerHa, 4)} t/ha</strong></div><div className="review-summary"><span>Dose física</span><strong>{formatNumber(limeResult.value.productDoseTonPerHa, 4)} t/ha</strong></div><div className="review-summary"><span>PRNT</span><strong>{formatNumber(limeResult.value.productPrntPercent, 2)}%</strong></div><div className="review-summary"><span>Total do talhão</span><strong>{formatNumber(limeResult.value.totalProductTon, 4)} t</strong></div><div className="review-summary"><span>Custo</span><strong>{formatMoney(limeResult.value.costPerHa)}/ha</strong><small>Total {formatMoney(limeResult.value.totalCost)}</small></div></div>}
          {chemicalResult?.error && <ResultError message={chemicalResult.error}/>}
          {chemicalResult?.value != null && <div className="review-grid"><div className="review-summary"><span>Entrada</span><strong>{formatNumber(parseNumber(chemicalValue), 4)} kg/ha {chemicalResult.from}</strong></div><div className="review-summary"><span>Equivalente</span><strong>{formatNumber(chemicalResult.value, 4)} kg/ha {chemicalResult.to}</strong></div></div>}
          {!nutrientResult && !supplyResult && !pkResult && !limeResult && !chemicalResult && <p className="report-empty-note">Preencha os dados para calcular.</p>}
        </div>
      </div>
    </section>
  );
}
