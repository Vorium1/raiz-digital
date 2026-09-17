"use client";

import { useCallback, useMemo, useState } from "react";
import { GoogleFieldMap } from "@/components/google-field-map";
import { LeafletFieldMap, MAP_NEUTRAL_COLOR } from "@/components/leaflet-field-map";
import type { FieldMapProps } from "@/components/spatial-map-types";
import { resolveSpatialMapProvider } from "@/lib/maps/spatial-map-provider";

export type { MapImageOverlay, MapLegendEntry, MapPoint, SpatialGeometry } from "@/components/spatial-map-types";

/**
 * Fachada única para mapas de talhão. Em produção, a base preferencial pode ser Google Satellite;
 * NDVI, pontos e contorno continuam sendo dados RAIZ/Copernicus/PostGIS e não dependem do provedor-base.
 * Se Google falhar em runtime, cai para Leaflet com camada de contingência sem quebrar a análise.
 */
export function RealFieldMap(props: FieldMapProps) {
  const resolution = useMemo(() => resolveSpatialMapProvider(), []);
  const [googleFailed, setGoogleFailed] = useState(false);
  const onProviderFailure = useCallback(() => setGoogleFailed(true), []);

  if (resolution.provider === "GOOGLE" && !googleFailed) {
    return <GoogleFieldMap {...props} onProviderFailure={onProviderFailure} />;
  }

  const providerNote = googleFailed
    ? "Google Satellite ficou indisponível nesta sessão; a RAIZ ativou o mapa-base de contingência sem alterar NDVI, contorno ou coordenadas."
    : resolution.reason === "GOOGLE_KEY_MISSING"
      ? "Google Satellite está selecionado, mas a chave pública ainda não foi vinculada; usando mapa-base de contingência."
      : null;

  return <LeafletFieldMap {...props} providerNote={providerNote} />;
}

export { MAP_NEUTRAL_COLOR };
