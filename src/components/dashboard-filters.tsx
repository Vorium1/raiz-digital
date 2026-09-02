"use client";

import { useRouter, useSearchParams } from "next/navigation";

type FilterOptions = {
  clients: Array<{ id: string; name: string }>;
  properties: Array<{ id: string; name: string; clientId: string }>;
  seasons: Array<{ id: string; seasonLabel: string; fieldId: string }>;
};

export function DashboardFilters({ options }: { options: FilterOptions }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value); else params.delete(key);
    router.push(`/dashboard?${params.toString()}`);
  }

  return (
    <div className="dashboard-filters no-print">
      <select value={searchParams.get("clientId") ?? ""} onChange={(event) => updateParam("clientId", event.target.value)}>
        <option value="">Todos os clientes</option>
        {options.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
      </select>
      <select value={searchParams.get("propertyId") ?? ""} onChange={(event) => updateParam("propertyId", event.target.value)}>
        <option value="">Todas as propriedades</option>
        {options.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
      </select>
      <select value={searchParams.get("cropSeasonId") ?? ""} onChange={(event) => updateParam("cropSeasonId", event.target.value)}>
        <option value="">Todas as safras</option>
        {options.seasons.map((season) => <option key={season.id} value={season.id}>{season.seasonLabel}</option>)}
      </select>
      {(searchParams.get("clientId") || searchParams.get("propertyId") || searchParams.get("cropSeasonId")) && (
        <button type="button" className="button ghost" onClick={() => router.push("/dashboard")}>Limpar filtros</button>
      )}
    </div>
  );
}
