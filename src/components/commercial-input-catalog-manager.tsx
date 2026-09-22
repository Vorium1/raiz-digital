"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/ui";

type Kind = "FERTILIZER" | "LIMESTONE" | "CORRECTIVE";
type Nutrient = "N" | "P2O5" | "K2O" | "S" | "Ca" | "Mg";
type Product = {
  id: string;
  code: string;
  name: string;
  kind: Kind;
  guaranteesPercent: Partial<Record<Nutrient, number>>;
  prntPercent: number | null;
  pricePerTon: number | null;
  minRateKgPerHa: number | null;
  maxRateKgPerHa: number | null;
  active: boolean;
  updatedAt: string;
};

type FormState = {
  code: string;
  name: string;
  kind: Kind;
  N: string;
  P2O5: string;
  K2O: string;
  S: string;
  Ca: string;
  Mg: string;
  prntPercent: string;
  pricePerTon: string;
  minRateKgPerHa: string;
  maxRateKgPerHa: string;
};

const NUTRIENTS: Nutrient[] = ["N", "P2O5", "K2O", "S", "Ca", "Mg"];
const EMPTY: FormState = {
  code: "", name: "", kind: "FERTILIZER",
  N: "", P2O5: "", K2O: "", S: "", Ca: "", Mg: "",
  prntPercent: "", pricePerTon: "", minRateKgPerHa: "", maxRateKgPerHa: "",
};
const KIND_LABEL: Record<Kind, string> = {
  FERTILIZER: "Fertilizante",
  LIMESTONE: "Calcário",
  CORRECTIVE: "Corretivo",
};

function nullableNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function formFromProduct(product: Product): FormState {
  return {
    code: product.code,
    name: product.name,
    kind: product.kind,
    N: product.guaranteesPercent.N?.toString() ?? "",
    P2O5: product.guaranteesPercent.P2O5?.toString() ?? "",
    K2O: product.guaranteesPercent.K2O?.toString() ?? "",
    S: product.guaranteesPercent.S?.toString() ?? "",
    Ca: product.guaranteesPercent.Ca?.toString() ?? "",
    Mg: product.guaranteesPercent.Mg?.toString() ?? "",
    prntPercent: product.prntPercent?.toString() ?? "",
    pricePerTon: product.pricePerTon?.toString() ?? "",
    minRateKgPerHa: product.minRateKgPerHa?.toString() ?? "",
    maxRateKgPerHa: product.maxRateKgPerHa?.toString() ?? "",
  };
}

function formulaLabel(product: Product) {
  const parts = NUTRIENTS.flatMap((nutrient) => {
    const value = product.guaranteesPercent[nutrient];
    return value == null ? [] : [`${nutrient} ${value}%`];
  });
  if (product.prntPercent != null) parts.push(`PRNT ${product.prntPercent}%`);
  return parts.length ? parts.join(" · ") : "Sem composição informada";
}

export function CommercialInputCatalogManager({ initialProducts, canManage }: { initialProducts: Product[]; canManage: boolean }) {
  const [products, setProducts] = useState(initialProducts);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const activeCount = useMemo(() => products.filter((product) => product.active).length, [products]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function payload() {
    const guaranteesPercent: Partial<Record<Nutrient, number>> = {};
    for (const nutrient of NUTRIENTS) {
      const value = nullableNumber(form[nutrient]);
      if (value != null) guaranteesPercent[nutrient] = value;
    }
    return {
      code: form.code,
      name: form.name,
      kind: form.kind,
      guaranteesPercent,
      prntPercent: nullableNumber(form.prntPercent),
      pricePerTon: nullableNumber(form.pricePerTon),
      minRateKgPerHa: nullableNumber(form.minRateKgPerHa),
      maxRateKgPerHa: nullableNumber(form.maxRateKgPerHa),
    };
  }

  async function save() {
    setBusy(true); setMessage(null);
    try {
      const endpoint = editingId ? `/api/commercial-input-products/${editingId}` : "/api/commercial-input-products";
      const response = await fetch(endpoint, {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível salvar o insumo.");
      const saved = data.product as Product;
      setProducts((current) => {
        const exists = current.some((item) => item.id === saved.id);
        const next = exists ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved];
        return next.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
      });
      setForm(EMPTY); setEditingId(null);
      setMessage({ tone: "success", text: "Insumo salvo. Fórmula, preço e limites ficam rastreados por empresa." });
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao salvar o insumo." });
    } finally { setBusy(false); }
  }

  async function toggleActive(product: Product) {
    setRowBusy(product.id); setMessage(null);
    try {
      const response = await fetch(`/api/commercial-input-products/${product.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: !product.active }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar o insumo.");
      const saved = data.product as Product;
      setProducts((current) => current.map((item) => item.id === saved.id ? saved : item));
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao atualizar o insumo." });
    } finally { setRowBusy(null); }
  }

  return (
    <section id="insumos" className="card" style={{ marginTop: 18 }}>
      <div className="card-header">
        <div><span className="eyebrow">INSUMOS COMERCIAIS</span><h2>Catálogo da empresa</h2></div>
        <StatusBadge tone={activeCount > 0 ? "success" : "waiting"}>{activeCount} ativo(s)</StatusBadge>
      </div>
      <div className="review-actions">
        <p className="report-empty-note" style={{ marginTop: 0 }}>
          Esta camada não cria recomendação agronômica. Ela guarda os produtos reais da empresa para converter uma necessidade já aprovada em kg/ha, toneladas e custo — sem fórmula, marca ou preço inventados pela IA.
        </p>
        {message && <div className={`agro-message ${message.tone}`}><Icon name={message.tone === "success" ? "check" : "warning"} size={14}/><span>{message.text}</span></div>}

        {canManage && (
          <div className="narrative-block" style={{ marginBottom: 16 }}>
            <h4>{editingId ? "Editar insumo" : "Cadastrar insumo"}</h4>
            <div className="review-grid">
              <label className="review-summary"><span>Código</span><input value={form.code} onChange={(event) => setField("code", event.target.value)} placeholder="Ex.: FORMULA-01"/></label>
              <label className="review-summary"><span>Nome</span><input value={form.name} onChange={(event) => setField("name", event.target.value)} placeholder="Nome comercial informado"/></label>
              <label className="review-summary"><span>Tipo</span><select value={form.kind} onChange={(event) => setField("kind", event.target.value as Kind)}><option value="FERTILIZER">Fertilizante</option><option value="LIMESTONE">Calcário</option><option value="CORRECTIVE">Corretivo</option></select></label>
              <label className="review-summary"><span>Preço (R$/t)</span><input type="number" min="0" step="0.01" value={form.pricePerTon} onChange={(event) => setField("pricePerTon", event.target.value)} placeholder="Opcional"/></label>
            </div>
            <div className="review-grid" style={{ marginTop: 8 }}>
              {NUTRIENTS.map((nutrient) => <label key={nutrient} className="review-summary"><span>{nutrient} (%)</span><input type="number" min="0" max="100" step="0.01" value={form[nutrient]} onChange={(event) => setField(nutrient, event.target.value)} placeholder="—"/></label>)}
            </div>
            <div className="review-grid" style={{ marginTop: 8 }}>
              <label className="review-summary"><span>PRNT (%)</span><input type="number" min="0.01" step="0.01" value={form.prntPercent} onChange={(event) => setField("prntPercent", event.target.value)} placeholder={form.kind === "LIMESTONE" ? "Obrigatório para calcário" : "Se aplicável"}/></label>
              <label className="review-summary"><span>Dose operacional mín. (kg/ha)</span><input type="number" min="0" step="0.1" value={form.minRateKgPerHa} onChange={(event) => setField("minRateKgPerHa", event.target.value)} placeholder="Opcional"/></label>
              <label className="review-summary"><span>Dose operacional máx. (kg/ha)</span><input type="number" min="0" step="0.1" value={form.maxRateKgPerHa} onChange={(event) => setField("maxRateKgPerHa", event.target.value)} placeholder="Opcional"/></label>
            </div>
            <div className="narrative-review-actions" style={{ marginTop: 10 }}>
              <button className="button secondary" disabled={busy || !form.code.trim() || !form.name.trim()} onClick={() => void save()}>{busy ? "Salvando…" : editingId ? "Salvar alterações" : "Cadastrar insumo"}</button>
              {editingId && <button className="button ghost" disabled={busy} onClick={() => { setEditingId(null); setForm(EMPTY); setMessage(null); }}>Cancelar</button>}
            </div>
          </div>
        )}

        {products.length === 0 ? <p className="report-empty-note">Nenhum insumo comercial cadastrado. A RAIZ não preenche fórmulas ou preços automaticamente.</p> : (
          <div className="field-ops-list">
            {products.map((product) => (
              <div key={product.id} className="field-ops-list-row">
                <span>
                  <strong>{product.name} <small>({product.code})</small></strong>
                  <small>{KIND_LABEL[product.kind]} · {formulaLabel(product)}</small>
                  <small>{product.pricePerTon == null ? "Preço não informado" : `${product.pricePerTon.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/t`}{product.minRateKgPerHa != null || product.maxRateKgPerHa != null ? ` · limite operacional ${product.minRateKgPerHa ?? "—"}–${product.maxRateKgPerHa ?? "—"} kg/ha` : ""}</small>
                </span>
                <div className="review-actions" style={{ margin: 0 }}>
                  <StatusBadge tone={product.active ? "success" : "waiting"}>{product.active ? "Ativo" : "Inativo"}</StatusBadge>
                  {canManage && <button className="button ghost small" disabled={rowBusy !== null || busy} onClick={() => { setEditingId(product.id); setForm(formFromProduct(product)); setMessage(null); }}>Editar</button>}
                  {canManage && <button className="button secondary small" disabled={rowBusy !== null || busy} onClick={() => void toggleActive(product)}>{rowBusy === product.id ? "Salvando…" : product.active ? "Desativar" : "Reativar"}</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
