"use client";

import { hasGoogleMapsBrowserKey } from "./google-maps-loader.ts";
import { hasMapboxBrowserToken } from "./mapbox-loader.ts";

export type SpatialMapProvider = "GOOGLE" | "MAPBOX" | "LEAFLET";
export type SpatialMapProviderResolution = {
  provider: SpatialMapProvider;
  requested: "AUTO" | "GOOGLE" | "MAPBOX" | "LEAFLET";
  reason:
    | "GOOGLE_CONFIGURED"
    | "MAPBOX_CONFIGURED"
    | "LEAFLET_EXPLICIT"
    | "GOOGLE_KEY_MISSING"
    | "MAPBOX_TOKEN_MISSING"
    | "AUTO_FALLBACK";
};

export function resolveSpatialMapProvider(): SpatialMapProviderResolution {
  const raw = (process.env.NEXT_PUBLIC_RAIZ_MAP_PROVIDER ?? "auto").trim().toLowerCase();
  const requested =
    raw === "google" ? "GOOGLE"
      : raw === "mapbox" ? "MAPBOX"
        : raw === "leaflet" ? "LEAFLET"
          : "AUTO";

  const googleReady = hasGoogleMapsBrowserKey();
  const mapboxReady = hasMapboxBrowserToken();

  if (requested === "LEAFLET") return { provider: "LEAFLET", requested, reason: "LEAFLET_EXPLICIT" };

  if (requested === "GOOGLE") {
    return googleReady
      ? { provider: "GOOGLE", requested, reason: "GOOGLE_CONFIGURED" }
      : mapboxReady
        ? { provider: "MAPBOX", requested, reason: "GOOGLE_KEY_MISSING" }
        : { provider: "LEAFLET", requested, reason: "GOOGLE_KEY_MISSING" };
  }

  if (requested === "MAPBOX") {
    return mapboxReady
      ? { provider: "MAPBOX", requested, reason: "MAPBOX_CONFIGURED" }
      : googleReady
        ? { provider: "GOOGLE", requested, reason: "MAPBOX_TOKEN_MISSING" }
        : { provider: "LEAFLET", requested, reason: "MAPBOX_TOKEN_MISSING" };
  }

  if (googleReady) return { provider: "GOOGLE", requested, reason: "GOOGLE_CONFIGURED" };
  if (mapboxReady) return { provider: "MAPBOX", requested, reason: "MAPBOX_CONFIGURED" };
  return { provider: "LEAFLET", requested, reason: "AUTO_FALLBACK" };
}
