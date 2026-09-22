"use client";

import { useRouter, useSearchParams } from "next/navigation";

type FilterOptions = {
  clients: Array<{ id: string; name: string }>;
  properties: Array<{ id: string; name: string; clientId: string }>;
  fields: Array<{ id: string; name: string; propertyId: string; clientId: string }>;
  seasons: Array<{ id: string; seasonLabel: string; fieldId: string; propertyId: string; clientId: string }>;
};

/**
 * Filtros contextuais da fila de Inteligência (Fase 3, Bloco A): cliente -> propriedade -> talhão ->
 * safra em cascata (mesmo padrão de `DashboardFilters`, Fase 1) + situação da interpretação e situação
 * da revisão, que são valores DERIVADOS (não uma coluna crua) -- ver `interpretationQueueBucket` em
 * `src/domain/interpretation-status.ts`, calculado no servidor a partir de status/motivo/revisor reais.
 */
export function IntelligenceQueueFilters({ options }: { options: FilterOptions }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientId = searchParams.get("clientId") ?? "";
  const propertyId = searchParams.get("propertyId") ?? "";
  const fieldId = searchParams.get("fieldId") ?? "";
  const seasonId = searchParams.get("seasonId") ?? "";
  const interpretationState = searchParams.get("interpretationState") ?? "";
  const reviewState = searchParams.get("reviewState") ?? "";

  const visibleProperties = clientId ? options.properties.filter((p) => p.clientId === clientId) : options.properties;
  const visibleFields = options.fields.filter((f) => (!clientId || f.clientId === clientId) && (!propertyId || f.propertyId === propertyId));
  const visibleSeasons = options.seasons.filter((s) => (!clientId || s.clientId === clientId) && (!propertyId || s.propertyId === propertyId) && (!fieldId || s.fieldId === fieldId));

  function setParams(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) continue;
      if (value) params.set(key, value); else params.delete(key);
    }
    router.push(`/inteligencia?${params.toString()}`);
  }

  const hasAnyFilter = clientId || propertyId || fieldId || seasonId || interpretationState || reviewState;

  return (
    <div className="dashboard-filters no-print">
      <select value={clientId} onChange={(e) => setParams({ clientId: e.target.value, propertyId: "", fieldId: "", seasonId: "" })}>
        <option value="">Todos os clientes</option>
        {options.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <select value={propertyId} onChange={(e) => setParams({ propertyId: e.target.value, fieldId: "", seasonId: "" })}>
        <option value="">Todas as propriedades</option>
        {visibleProperties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <select value={fieldId} onChange={(e) => setParams({ fieldId: e.target.value, seasonId: "" })}>
        <option value="">Todos os talhões</option>
        {visibleFields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
      <select value={seasonId} onChange={(e) => setParams({ seasonId: e.target.value })}>
        <option value="">Todas as safras</option>
        {visibleSeasons.map((s) => <option key={s.id} value={s.id}>{s.seasonLabel}</option>)}
      </select>
      <select value={interpretationState} onChange={(e) => setParams({ interpretationState: e.target.value })}>
        <option value="">Situação da interpretação: todas</option>
        <option value="BLOQUEADA">Dado impede interpretação</option>
        <option value="INTERPRETAVEL">Interpretável</option>
      </select>
      <select value={reviewState} onChange={(e) => setParams({ reviewState: e.target.value })}>
        <option value="">Situação da revisão: todas</option>
        <option value="AGUARDANDO_REVISAO">Aguardando revisão</option>
        <option value="REVISAO_EM_ANDAMENTO">Revisão em andamento</option>
        <option value="APROVADA">Aprovada</option>
      </select>
      {hasAnyFilter && <button type="button" className="button ghost" onClick={() => router.push("/inteligencia")}>Limpar filtros</button>}
    </div>
  );
}
