import assert from "node:assert/strict";
import { earthSearchNdviProvider } from "../src/lib/satellite/earth-search-ndvi-provider.ts";

const center = { lon: -52.4066667, lat: -28.2627778 };
const dLon = 0.0025;
const dLat = 0.0025;
const geometry = {
  type: "Polygon",
  coordinates: [[
    [center.lon - dLon, center.lat - dLat],
    [center.lon + dLon, center.lat - dLat],
    [center.lon + dLon, center.lat + dLat],
    [center.lon - dLon, center.lat + dLat],
    [center.lon - dLon, center.lat - dLat],
  ]],
};

const to = new Date();
const from = new Date(to);
from.setUTCDate(from.getUTCDate() - 120);
const iso = (date) => date.toISOString().slice(0, 10);

const scenes = await earthSearchNdviProvider.fetchFieldNdviSeries({
  fieldBoundaryGeoJson: geometry,
  fromDate: iso(from),
  toDate: iso(to),
  maxCloudCoverPct: 70,
});

assert.ok(scenes.length > 0, "Earth Search não retornou nenhuma cena válida no período de 120 dias.");
const latest = scenes.at(-1);
assert.ok(latest);
assert.ok(latest.meanNdvi >= -1 && latest.meanNdvi <= 1);
assert.ok(latest.minNdvi >= -1 && latest.minNdvi <= 1);
assert.ok(latest.maxNdvi >= -1 && latest.maxNdvi <= 1);
assert.ok(latest.pixelCount > 0);

const map = await earthSearchNdviProvider.fetchFieldNdviMap({
  fieldBoundaryGeoJson: geometry,
  capturedAt: latest.capturedAt,
  maxCloudCoverPct: 70,
});

const bytes = Buffer.from(map.bytes);
assert.ok(bytes.length > 100, "PNG NDVI vazio ou pequeno demais.");
assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "Artefato não é PNG.");
assert.ok(map.width > 0 && map.height > 0);

console.log(JSON.stringify({
  provider: "earth-search",
  capturedAt: latest.capturedAt,
  scenes: scenes.length,
  meanNdvi: latest.meanNdvi,
  minNdvi: latest.minNdvi,
  maxNdvi: latest.maxNdvi,
  validPixels: latest.pixelCount,
  pngBytes: bytes.length,
  width: map.width,
  height: map.height,
}, null, 2));
