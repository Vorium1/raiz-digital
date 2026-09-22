"use client";

import { useRouter, useSearchParams } from "next/navigation";

type FilterOptions = {
  clients: Array<{ id: string; name: string }>;
  properties: Array<{ id: string; name: string; clientId: string }>;
  seasons: Array<{ id: string; seasonLabel: string; fieldId: string; propertyId: string; clientId: string }>;
};

/**
 * Filtro real de contexto (cliente -> propriedade -> safra), com URL como fonte da verdade -- reload,
 * link direto e "voltar" do navegador já preservavam a seleção (searchParams), isso já estava certo.
 * O que faltava (Fase 1, item 2 do briefing): ao trocar um nível superior, as opções abaixo continuavam
 * mostrando TODAS as propriedades/safras, mesmo as de outro cliente -- e a seleção de um filho
 * incompatível (ex.: propriedade de outro cliente) ficava presa na URL, produzindo uma combinação
 * impossível sem avisar. Agora cada nível é filtrado pelo pai, e trocar um nível limpa os filhos.
 */
export function DashboardFilters({ options }: { options: FilterOptions }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientId = searchParams.get("clientId") ?? "";
  const propertyId = searchParams.get("propertyId") ?? "";
  const cropSeasonId = searchParams.get("cropSeasonId") ?? "";

  const visibleProperties = clientId ? options.properties.filter((p) => p.clientId === clientId) : options.properties;
  const visibleSeasons = options.seasons.filter((s) => (!clientId || s.clientId === clientId) && (!propertyId || s.propertyId === propertyId));

  function setParams(next: { clientId?: string; propertyId?: string; cropSeasonId?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of ["clientId", "propertyId", "cropSeasonId"] as const) {
      const value = next[key];
      if (value === undefined) continue;
      if (value) params.set(key, value); else params.delete(key);
    }
    router.push(`/dashboard?${params.toString()}`);
  }

  function onClientChange(value: string) {
    // Trocar de cliente invalida propriedade/safra (podiam pertencer a outro cliente) -- limpa os dois.
    setParams({ clientId: value, propertyId: "", cropSeasonId: "" });
  }
  function onPropertyChange(value: string) {
    // Trocar de propriedade invalida a safra selecionada (podia ser de outro talhão/propriedade).
    setParams({ propertyId: value, cropSeasonId: "" });
  }

  return (
    <div className="dashboard-filters no-print">
      <select value={clientId} onChange={(event) => onClientChange(event.target.value)}>
        <option value="">Todos os clientes</option>
        {options.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
      </select>
      <select value={propertyId} onChange={(event) => onPropertyChange(event.target.value)}>
        <option value="">Todas as propriedades</option>
        {visibleProperties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
      </select>
      <select value={cropSeasonId} onChange={(event) => setParams({ cropSeasonId: event.target.value })}>
        <option value="">Todas as safras</option>
        {visibleSeasons.map((season) => <option key={season.id} value={season.id}>{season.seasonLabel}</option>)}
      </select>
      {(clientId || propertyId || cropSeasonId) && (
        <button type="button" className="button ghost" onClick={() => router.push("/dashboard")}>Limpar filtros</button>
      )}
    </div>
  );
}
