"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/ui";
import { analysisStatusMeta, formatRelativeOrDate, ANALYSIS_STATUS_OPTIONS } from "@/domain/analysis-ui";

type Analysis = {
  id: string;
  code: string;
  status: string;
  clientName: string;
  fieldName: string;
  areaHa: number;
  updatedAt: string;
};

const statusFilters = [{ value: "", label: "Todos os status" }, ...ANALYSIS_STATUS_OPTIONS];

export function AnalysesTable({ analyses }: { analyses: Analysis[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    return analyses.filter((analysis) => {
      if (status && analysis.status !== status) return false;
      if (!needle) return true;
      return [analysis.code, analysis.clientName, analysis.fieldName].some((value) => value?.toLocaleLowerCase("pt-BR").includes(needle));
    });
  }, [analyses, query, status]);

  return (
    <>
      <div className="toolbar">
        <div className="toolbar-left">
          <label className="search-box"><Icon name="search" size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar por cliente, área ou código" placeholder="Buscar por cliente, área ou código" /></label>
          <select className="select" aria-label="Filtrar status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {statusFilters.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
        <div className="toolbar-right"><Link href="/analises/nova?etapa=laudo" className="button secondary"><Icon name="upload" size={16} />Importar laudo</Link></div>
      </div>
      <div className="data-card">
        {analyses.length === 0 ? (
          <div className="empty-state"><Icon name="flask" /><strong>Nenhuma análise criada</strong><small>Cadastre a estrutura da propriedade e crie a primeira análise para iniciar o histórico técnico.</small></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><Icon name="search" /><strong>Nenhuma análise encontrada</strong><small>Ajuste a busca ou o filtro de status.</small></div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Análise</th><th>Área</th><th>Progresso</th><th>Status</th><th>Atualização</th><th></th></tr></thead>
            <tbody>
              {filtered.map((analysis) => {
                const meta = analysisStatusMeta(analysis.status);
                return (
                  <tr key={analysis.id}>
                    <td><Link href={`/analises/${analysis.id}`} className="table-link">{analysis.code}</Link><strong>{analysis.clientName}</strong></td>
                    <td>{analysis.fieldName} · {Number(analysis.areaHa).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</td>
                    <td className="progress-cell"><div><i style={{ width: `${meta.progress}%` }} /></div><small>{meta.progress}% do fluxo</small></td>
                    <td><StatusBadge tone={meta.tone}>{meta.label}</StatusBadge></td>
                    <td>{formatRelativeOrDate(analysis.updatedAt)}</td>
                    <td><Link href={`/analises/${analysis.id}`} aria-label={`Abrir ${analysis.code}`}><Icon name="chevron" size={17} /></Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
