"use client";

import { hasGoogleMapsBrowserKey } from "./google-maps-loader.ts";

export type SpatialMapProvider = "GOOGLE" | "LEAFLET";
export type SpatialMapProviderResolution = {
  provider: SpatialMapProvider;
  requested: "AUTO" | "GOOGLE" | "LEAFLET";
  reason: "GOOGLE_CONFIGURED" | "LEAFLET_EXPLICIT" | "GOOGLE_KEY_MISSING" | "AUTO_FALLBACK";
};

export function resolveSpatialMapProvider(): SpatialMapProviderResolution {
  const raw = (process.env.NEXT_PUBLIC_RAIZ_MAP_PROVIDER ?? "auto").trim().toLowerCase();
  const requested = raw === "google" ? "GOOGLE" : raw === "leaflet" ? "LEAFLET" : "AUTO";
  const googleReady = hasGoogleMapsBrowserKey();

  if (requested === "LEAFLET") return { provider: "LEAFLET", requested, reason: "LEAFLET_EXPLICIT" };
  if (requested === "GOOGLE") {
    return googleReady
      ? { provider: "GOOGLE", requested, reason: "GOOGLE_CONFIGURED" }
      : { provider: "LEAFLET", requested, reason: "GOOGLE_KEY_MISSING" };
  }
  return googleReady
    ? { provider: "GOOGLE", requested, reason: "GOOGLE_CONFIGURED" }
    : { provider: "LEAFLET", requested, reason: "AUTO_FALLBACK" };
}
