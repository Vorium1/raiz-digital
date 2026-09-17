import assert from "node:assert/strict";
import {
  effectivePointCoordinates,
  pointPositionKind,
  spatialGeometryPositions,
} from "../src/components/spatial-map-types.ts";
import { resolveSpatialMapProvider } from "../src/lib/maps/spatial-map-provider.ts";
import {
  GOOGLE_MAPS_LOAD_TIMEOUT_MS,
  GOOGLE_MAPS_TILE_HEALTH_TIMEOUT_MS,
  shouldReuseLoadedGoogleMaps,
} from "../src/lib/maps/google-maps-loader.ts";

function point(overrides = {}) {
  return {
    id: "p1",
    code: "01",
    sequence: 1,
    latitude: -28.25,
    longitude: -52.4,
    observedLatitude: null,
    observedLongitude: null,
    collectedAt: null,
    depthFromCm: 0,
    depthToCm: 20,
    subsampleCount: null,
    accuracyM: null,
    gpsSource: null,
    notes: null,
    labResultCount: 0,
    ...overrides,
  };
}

assert.equal(pointPositionKind(point()), "PLANNED", "ponto comum sem observação deve continuar planejado");
assert.equal(
  pointPositionKind(point({ gpsSource: "SHAPEFILE_REAL_GPS_LONLAT" })),
  "AUDITED_SOURCE",
  "fonte Cabeda GPS lon/lat auditada deve permanecer coordenada real",
);
assert.equal(
  pointPositionKind(point({ gpsSource: "shapefile_real_epsg4326" })),
  "AUDITED_SOURCE",
  "fonte auditada deve ser reconhecida sem depender de caixa",
);
assert.equal(
  pointPositionKind(point({ gpsSource: "  SHAPEFILE_REAL_EPSG4326  " })),
  "AUDITED_SOURCE",
  "espaço acidental ao redor da fonte não deve alterar a semântica do valor exato",
);
assert.equal(
  pointPositionKind(point({ gpsSource: "SHAPEFILE_REAL_GPS_LONLAT_FAKE" })),
  "PLANNED",
  "sufixo arbitrário não pode promover uma fonte para coordenada real auditada",
);
assert.equal(
  pointPositionKind(point({ gpsSource: "SHAPEFILE_REAL_EPSG4326_IMPORT" })),
  "PLANNED",
  "somente os valores exatos aceitos pelo auditor podem ser tratados como proveniência real",
);
assert.equal(
  pointPositionKind(point({ gpsSource: "IMPORTED_GEOJSON" })),
  "PLANNED",
  "importação genérica não pode virar fonte real auditada por inferência",
);

const observedPoint = point({
  gpsSource: "SHAPEFILE_REAL_GPS_LONLAT",
  latitude: -28.25,
  longitude: -52.4,
  observedLatitude: -28.2507777,
  observedLongitude: -52.4008888,
});
assert.equal(
  pointPositionKind(observedPoint),
  "OBSERVED",
  "captura observada em campo deve prevalecer sobre a proveniência histórica",
);
assert.deepEqual(
  effectivePointCoordinates(observedPoint),
  { latitude: -28.2507777, longitude: -52.4008888 },
  "mapas devem renderizar a posição observada, não a posição-base, quando ambas existem",
);
assert.deepEqual(
  effectivePointCoordinates(point({ gpsSource: "SHAPEFILE_REAL_EPSG4326", latitude: -28.1234567, longitude: -52.7654321 })),
  { latitude: -28.1234567, longitude: -52.7654321 },
  "fonte real auditada sem observed_position deve renderizar a posição importada preservada",
);

const geometry = {
  type: "MultiPolygon",
  coordinates: [
    [[[-52.4, -28.2], [-52.3, -28.2], [-52.3, -28.3], [-52.4, -28.2]]],
    [[[-52.2, -28.1], [-52.1, -28.1], [-52.1, -28.2], [-52.2, -28.1]]],
  ],
};
const positions = spatialGeometryPositions(geometry);
assert.equal(positions.length, 8, "MultiPolygon deve preservar todas as posições para bounds/renderização");
assert.deepEqual(positions[0], [-52.4, -28.2]);
assert.deepEqual(positions.at(-1), [-52.2, -28.1]);

const previousProvider = process.env.NEXT_PUBLIC_RAIZ_MAP_PROVIDER;
const previousKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
try {
  delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  process.env.NEXT_PUBLIC_RAIZ_MAP_PROVIDER = "auto";
  assert.deepEqual(resolveSpatialMapProvider(), {
    provider: "LEAFLET",
    requested: "AUTO",
    reason: "AUTO_FALLBACK",
  });

  process.env.NEXT_PUBLIC_RAIZ_MAP_PROVIDER = "google";
  assert.deepEqual(resolveSpatialMapProvider(), {
    provider: "LEAFLET",
    requested: "GOOGLE",
    reason: "GOOGLE_KEY_MISSING",
  });

  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "browser-key-sintetica";
  process.env.NEXT_PUBLIC_RAIZ_MAP_PROVIDER = "auto";
  assert.deepEqual(resolveSpatialMapProvider(), {
    provider: "GOOGLE",
    requested: "AUTO",
    reason: "GOOGLE_CONFIGURED",
  });

  process.env.NEXT_PUBLIC_RAIZ_MAP_PROVIDER = "leaflet";
  assert.deepEqual(resolveSpatialMapProvider(), {
    provider: "LEAFLET",
    requested: "LEAFLET",
    reason: "LEAFLET_EXPLICIT",
  });
} finally {
  if (previousProvider === undefined) delete process.env.NEXT_PUBLIC_RAIZ_MAP_PROVIDER;
  else process.env.NEXT_PUBLIC_RAIZ_MAP_PROVIDER = previousProvider;
  if (previousKey === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  else process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = previousKey;
}

assert.equal(
  shouldReuseLoadedGoogleMaps(true, false),
  true,
  "namespace Google saudável pode ser reutilizada em novas montagens",
);
assert.equal(
  shouldReuseLoadedGoogleMaps(true, true),
  false,
  "gm_authFailure deve impedir que uma namespace residual seja reutilizada na mesma sessão",
);
assert.equal(
  shouldReuseLoadedGoogleMaps(false, false),
  false,
  "namespace incompleta nunca deve ser tratada como carregada",
);

assert.ok(GOOGLE_MAPS_LOAD_TIMEOUT_MS >= 10_000, "loader deve ter timeout explícito e conservador");
assert.ok(GOOGLE_MAPS_TILE_HEALTH_TIMEOUT_MS >= 8_000, "saúde dos tiles deve esperar tempo suficiente antes do fallback");
assert.ok(GOOGLE_MAPS_TILE_HEALTH_TIMEOUT_MS < GOOGLE_MAPS_LOAD_TIMEOUT_MS, "health check de tiles deve ser limitado e inferior ao teto do loader");

console.log("OK — mapa espacial: coordenada efetiva, proveniência exata, MultiPolygon, auth latch, provider e timeouts fail-closed.");
