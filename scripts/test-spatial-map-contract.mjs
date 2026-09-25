import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertValidGeographicCoordinate,
  effectivePointCoordinates,
  pointGeoJsonCoordinates,
  pointLatLngCoordinates,
  pointPositionKind,
  spatialGeometryPositions,
} from "../src/components/spatial-map-types.ts";
import { resolveSpatialMapProvider } from "../src/lib/maps/spatial-map-provider.ts";
import {
  GOOGLE_MAPS_LOAD_TIMEOUT_MS,
  GOOGLE_MAPS_TILE_HEALTH_TIMEOUT_MS,
  shouldReuseLoadedGoogleMaps,
} from "../src/lib/maps/google-maps-loader.ts";
import {
  MAPBOX_GL_VERSION,
  MAPBOX_LOAD_TIMEOUT_MS,
} from "../src/lib/maps/mapbox-loader.ts";

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
  "AUDITED_SOURCE",
  "fonte espacial auditada pura deve permanecer autoridade mesmo se houver observed_position legado",
);
assert.deepEqual(
  effectivePointCoordinates(observedPoint),
  { latitude: -28.25, longitude: -52.4 },
  "mapas devem ignorar observed_position legado quando a fonte persistida é uma geometria real auditada",
);

const recollectedAfterAudit = point({
  gpsSource: "SHAPEFILE_REAL_GPS_LONLAT+BROWSER_GPS",
  latitude: -28.25,
  longitude: -52.4,
  observedLatitude: -28.2507777,
  observedLongitude: -52.4008888,
});
assert.equal(
  pointPositionKind(recollectedAfterAudit),
  "OBSERVED",
  "coleta posterior via navegador deve ser reconhecida como observação corrente",
);
assert.deepEqual(
  effectivePointCoordinates(recollectedAfterAudit),
  { latitude: -28.2507777, longitude: -52.4008888 },
  "coleta posterior registrada deve voltar a prevalecer sobre a posição-base",
);
assert.deepEqual(
  effectivePointCoordinates(point({ gpsSource: "SHAPEFILE_REAL_EPSG4326", latitude: -28.1234567, longitude: -52.7654321 })),
  { latitude: -28.1234567, longitude: -52.7654321 },
  "fonte real auditada sem observed_position deve renderizar a posição importada preservada",
);


const exactPoint = point({
  gpsSource: "SHAPEFILE_REAL_EPSG4326",
  latitude: -28.123456789,
  longitude: -52.765432198,
});
assert.deepEqual(
  pointGeoJsonCoordinates(exactPoint),
  [-52.765432198, -28.123456789],
  "GeoJSON/Google Data/Mapbox devem preservar exatamente [longitude, latitude] sem arredondamento",
);
assert.deepEqual(
  pointLatLngCoordinates(exactPoint),
  [-28.123456789, -52.765432198],
  "Leaflet/Google LatLng devem preservar exatamente [latitude, longitude] sem arredondamento",
);
assert.doesNotThrow(() => assertValidGeographicCoordinate(-28.123456789, -52.765432198));
assert.throws(
  () => assertValidGeographicCoordinate(-128, -52),
  /latitude fora/,
  "latitude inválida deve falhar fechado em vez de desenhar ponto em posição incorreta",
);
assert.throws(
  () => assertValidGeographicCoordinate(-28, -252),
  /longitude fora/,
  "longitude inválida deve falhar fechado em vez de desenhar ponto em posição incorreta",
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
const previousMapbox = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
try {
  delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  delete process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  process.env.NEXT_PUBLIC_RAIZ_MAP_PROVIDER = "auto";
  assert.deepEqual(resolveSpatialMapProvider(), {
    provider: "LEAFLET",
    requested: "AUTO",
    reason: "AUTO_FALLBACK",
  });

  process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN = "pk.synthetic-mapbox";
  assert.deepEqual(resolveSpatialMapProvider(), {
    provider: "MAPBOX",
    requested: "AUTO",
    reason: "MAPBOX_CONFIGURED",
  });

  process.env.NEXT_PUBLIC_RAIZ_MAP_PROVIDER = "google";
  assert.deepEqual(resolveSpatialMapProvider(), {
    provider: "MAPBOX",
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

  delete process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  process.env.NEXT_PUBLIC_RAIZ_MAP_PROVIDER = "mapbox";
  assert.deepEqual(resolveSpatialMapProvider(), {
    provider: "GOOGLE",
    requested: "MAPBOX",
    reason: "MAPBOX_TOKEN_MISSING",
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
  if (previousMapbox === undefined) delete process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  else process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN = previousMapbox;
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

const ndviRasterRouteSource = readFileSync(new URL("../src/app/api/fields/[id]/ndvi/map/route.ts", import.meta.url), "utf8");
const googleFieldMapSource = readFileSync(new URL("../src/components/google-field-map.tsx", import.meta.url), "utf8");
assert.match(
  ndviRasterRouteSource,
  /["']cache-control["']\s*:\s*["']private, no-store["']/,
  "raster NDVI autenticado não pode ficar armazenado por longo prazo no cache do navegador",
);
assert.doesNotMatch(
  ndviRasterRouteSource,
  /max-age\s*=\s*31536000|immutable/i,
  "imutabilidade do artefato não pode tornar imutável a autorização de acesso no navegador",
);


const mapDataSource = readFileSync(new URL("../src/lib/repositories/map-data.ts", import.meta.url), "utf8");
const mapboxFieldMapSource = readFileSync(new URL("../src/components/mapbox-field-map.tsx", import.meta.url), "utf8");
const leafletFieldMapSource = readFileSync(new URL("../src/components/leaflet-field-map.tsx", import.meta.url), "utf8");
assert.match(
  mapDataSource,
  /ST_Y\(sp\.position\)::float8 AS latitude[\s\S]*ST_X\(sp\.position\)::float8 AS longitude/,
  "API deve extrair latitude de Y e longitude de X sem COALESCE ou troca de eixo",
);
assert.match(googleFieldMapSource, /pointGeoJsonCoordinates\(point\)/, "Google deve usar conversão canônica [lng,lat]");
assert.match(googleFieldMapSource, /pointLatLngCoordinates\(point\)/, "Google bounds deve usar conversão canônica [lat,lng]");
assert.match(mapboxFieldMapSource, /pointGeoJsonCoordinates\(point\)/, "Mapbox deve usar conversão canônica [lng,lat]");
assert.match(leafletFieldMapSource, /pointLatLngCoordinates\(point\)/, "Leaflet deve usar conversão canônica [lat,lng]");

assert.match(googleFieldMapSource, /data-map-ready=/, "GoogleFieldMap deve expor readiness de tiles ao QA/runtime");
assert.match(googleFieldMapSource, /"tilesloaded"/, "GoogleFieldMap só pode declarar mapa pronto após tilesloaded");
assert.match(googleFieldMapSource, /real-field-map-loading/, "canvas transitório sem tiles deve ficar coberto por loading limpo");

assert.ok(GOOGLE_MAPS_LOAD_TIMEOUT_MS >= 10_000, "loader deve ter timeout explícito e conservador");
assert.ok(GOOGLE_MAPS_TILE_HEALTH_TIMEOUT_MS >= 8_000, "saúde dos tiles deve esperar tempo suficiente antes do fallback");
assert.ok(GOOGLE_MAPS_TILE_HEALTH_TIMEOUT_MS < GOOGLE_MAPS_LOAD_TIMEOUT_MS, "health check de tiles deve ser limitado e inferior ao teto do loader");
assert.equal(MAPBOX_GL_VERSION, "3.30.0", "integração Mapbox deve usar a versão documentada do GL JS");
assert.ok(MAPBOX_LOAD_TIMEOUT_MS >= 10_000, "loader Mapbox também deve falhar com timeout explícito");

console.log("OK — mapa espacial: coordenada efetiva, proveniência exata, MultiPolygon, tiles ready, auth latch, cache privado e timeouts fail-closed.");
