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
  recommendationCurrent: boolean;
  recommendationCurrentCode: string;
  recommendationCurrentReason: string | null;
  status: "OK" | "UNDER" | "OVER" | "UNIT_MISMATCH" | "NOT_APPLIED" | "STALE_RECOMMENDATION";
};

const STATUS_META: Record<ComparisonRow["status"], { label: string; tone: "success" | "danger" | "review" | "waiting" }> = {
  OK: { label: "Conforme recomendado", tone: "success" },
  UNDER: { label: "Abaixo do recomendado", tone: "danger" },
  OVER: { label: "Acima do recomendado", tone: "review" },
  UNIT_MISMATCH: { label: "Unidade diferente — confira manualmente", tone: "review" },
  NOT_APPLIED: { label: "Ainda não aplicado", tone: "waiting" },
  STALE_RECOMMENDATION: { label: "Recomendação histórica", tone: "review" },
};

/**
 * Comparação recomendado × usado. Uma recomendação promovida por IA deixa de ser baseline corrente
 * quando o contexto da safra ou a interpretação determinística que a sustentava mudam. O histórico
 * continua visível, mas nunca recebe status "abaixo/acima/conforme" depois de ficar stale.
 */
export function InputComparisonPanel({ analysisId }: { analysisId: string }) {
  const [rows, setRows] = useState<ComparisonRow[] | null>(null);

  useEffect(() => {
    fetch(`/api/analyses/${analysisId}/input-comparison`, { cache: "no-store" })
      .then((response) => response.json().catch(() => ({})))
      .then((payload) => setRows((payload.comparison ?? []) as ComparisonRow[]));
  }, [analysisId]);

  if (!rows || rows.length === 0) return null;
  const hasUnderApplication = rows.some((row) => row.status === "UNDER");
  const staleRows = rows.filter((row) => row.status === "STALE_RECOMMENDATION");

  return (
    <section className="card">
      <div className="card-header"><div><span className="eyebrow">RECOMENDADO × USADO</span><h2>Comparação de insumo</h2></div></div>
      <div className="review-actions">
        {staleRows.length > 0 && (
          <div className="field-ops-inline-warning" style={{ marginBottom: 12 }}>
            <Icon name="warning" size={16}/>
            <span>{staleRows.length === 1 ? "Existe uma recomendação histórica que não deve mais ser usada como referência de aplicação." : `Existem ${staleRows.length} recomendações históricas que não devem mais ser usadas como referência de aplicação.`} Gere e aprove uma nova recomendação com as evidências atuais.</span>
          </div>
        )}
        {hasUnderApplication && <div className="field-ops-inline-warning" style={{ marginBottom: 12 }}><Icon name="warning" size={16}/><span>Pelo menos um insumo foi aplicado abaixo da recomendação corrente.</span></div>}
        <div className="field-ops-list">
          {rows.map((row) => (
            <div key={row.inputType} className="field-ops-list-row">
              <span>
                <strong>{row.inputType}</strong>
                <small>{row.recommendationCurrent ? "Recomendado" : "Referência histórica"}: {row.recommendedQuantity.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {row.recommendedUnit}{row.appliedQuantity != null ? ` · Aplicado: ${row.appliedQuantity.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${row.appliedUnit}` : row.hasAnyApplication ? " · Aplicado em outra unidade" : " · Nada aplicado ainda"}</small>
                {!row.recommendationCurrent && row.recommendationCurrentReason && <small>{row.recommendationCurrentReason}</small>}
              </span>
              <StatusBadge tone={STATUS_META[row.status].tone}>{STATUS_META[row.status].label}</StatusBadge>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
