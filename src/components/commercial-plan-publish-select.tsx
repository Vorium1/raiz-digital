"use client";

import { useEffect, useState } from "react";

type Snapshot = {
  id: string;
  label: string | null;
  simulationMode: "SINGLE" | "PK_PAIR" | "LIME";
  productSnapshots: Array<{ name?: string; code?: string }>;
  createdAt: string;
};

function modeLabel(mode: Snapshot["simulationMode"]) {
  return mode === "SINGLE" ? "Produto único" : mode === "PK_PAIR" ? "Combinação P/K" : "Calcário / PRNT";
}

function optionLabel(snapshot: Snapshot) {
  const products = (snapshot.productSnapshots ?? [])
    .map((product) => product.name ?? product.code)
    .filter(Boolean)
    .join(" + ");
  const prefix = snapshot.label?.trim() || modeLabel(snapshot.simulationMode);
  const date = new Date(snapshot.createdAt).toLocaleDateString("pt-BR");
  return [prefix, products, date].filter(Boolean).join(" · ");
}

export function CommercialPlanPublishSelect({
  analysisId,
  value,
  onChange,
  disabled = false,
}: {
  analysisId: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    fetch(`/api/analyses/${analysisId}/commercial-plan-snapshots`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar os cenários comerciais.");
        if (active) setSnapshots((payload.snapshots ?? []) as Snapshot[]);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Falha ao carregar cenários comerciais.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [analysisId]);

  if (loading) {
    return <small style={{ color: "#6f7e74" }}>Carregando cenários comerciais…</small>;
  }

  if (error) {
    return <small role="alert" style={{ color: "#b3473e" }}>{error}</small>;
  }

  if (snapshots.length === 0 && !value) {
    return <small style={{ color: "#6f7e74" }}>Sem cenário comercial salvo. O laudo continuará sem produto/preço comercial congelado.</small>;
  }

  const selectedOutsideRecentList = Boolean(value && !snapshots.some((snapshot) => snapshot.id === value));

  return (
    <label style={{ display: "grid", gap: 5, minWidth: 260, maxWidth: 520 }}>
      <span style={{ fontSize: 10, fontWeight: 800, color: "#53685b" }}>Plano comercial no laudo (opcional)</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        style={{ width: "100%", minHeight: 36, border: "1px solid #dbe4dc", borderRadius: 9, padding: "0 10px", background: "#fff" }}
      >
        <option value="">Sem plano comercial</option>
        {selectedOutsideRecentList && <option value={value}>Plano comercial atualmente publicado</option>}
        {snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{optionLabel(snapshot)}</option>)}
      </select>
      <small style={{ color: "#7e8a82", lineHeight: 1.4 }}>
        O RAIZ só aceitará no publish um cenário baseado na prescrição oficial corrente e sem violação operacional.
      </small>
    </label>
  );
}
