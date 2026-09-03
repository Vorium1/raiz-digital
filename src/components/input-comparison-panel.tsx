"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/ui";

type ComparisonRow = {
  inputType: string;
  recommendedQuantity: number;
  recommendedUnit: string;
  recommendedAt: string;
  appliedQuantity: number | null;
  appliedUnit: string | null;
  hasAnyApplication: boolean;
  status: "OK" | "UNDER" | "OVER" | "UNIT_MISMATCH" | "NOT_APPLIED";
};

const STATUS_META: Record<ComparisonRow["status"], { label: string; tone: "success" | "danger" | "review" | "waiting" }> = {
  OK: { label: "Conforme recomendado", tone: "success" },
  UNDER: { label: "Abaixo do recomendado", tone: "danger" },
  OVER: { label: "Acima do recomendado", tone: "review" },
  UNIT_MISMATCH: { label: "Unidade diferente — confira manualmente", tone: "review" },
  NOT_APPLIED: { label: "Ainda não aplicado", tone: "waiting" },
};

/**
 * Comparação recomendado × usado, pedida desde a estruturação original com
 * o Rafael: alerta automático quando o que foi realmente aplicado em campo
 * ficou abaixo do que a prescrição (aprovada por um agrônomo) recomendou.
 * Só compara quantidades na mesma unidade -- nunca converte por conta
 * própria.
 */
export function InputComparisonPanel({ analysisId }: { analysisId: string }) {
  const [rows, setRows] = useState<ComparisonRow[] | null>(null);

  useEffect(() => {
    fetch(`/api/analyses/${analysisId}/input-comparison`, { cache: "no-store" })
      .then((response) => response.json().catch(() => ({})))
      .then((payload) => setRows((payload.comparison ?? []) as ComparisonRow[]));
  }, [analysisId]);

  if (!rows || rows.length === 0) return null;
  const hasWarning = rows.some((row) => row.status === "UNDER");

  return (
    <section className="card">
      <div className="card-header"><div><span className="eyebrow">RECOMENDADO × USADO</span><h2>Comparação de insumo</h2></div></div>
      <div className="review-actions">
        {hasWarning && <div className="field-ops-inline-warning" style={{ marginBottom: 12 }}><Icon name="warning" size={16}/><span>Pelo menos um insumo foi aplicado abaixo da quantidade recomendada.</span></div>}
        <div className="field-ops-list">
          {rows.map((row) => (
            <div key={row.inputType} className="field-ops-list-row">
              <span>
                <strong>{row.inputType}</strong>
                <small>Recomendado: {row.recommendedQuantity.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {row.recommendedUnit}{row.appliedQuantity != null ? ` · Aplicado: ${row.appliedQuantity.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${row.appliedUnit}` : row.hasAnyApplication ? " · Aplicado em outra unidade" : " · Nada aplicado ainda"}</small>
              </span>
              <StatusBadge tone={STATUS_META[row.status].tone}>{STATUS_META[row.status].label}</StatusBadge>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
