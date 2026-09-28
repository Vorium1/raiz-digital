import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const loginForm = await readFile(new URL("../src/components/login-form.tsx", import.meta.url), "utf8");
const session = await readFile(new URL("../src/lib/auth/session.ts", import.meta.url), "utf8");
const db = await readFile(new URL("../src/lib/db.ts", import.meta.url), "utf8");
const home = await readFile(new URL("../src/app/(platform)/inicio/page.tsx", import.meta.url), "utf8");
const ndviRoute = await readFile(new URL("../src/app/api/fields/[id]/ndvi/route.ts", import.meta.url), "utf8");
const ndviMapRoute = await readFile(new URL("../src/app/api/fields/[id]/ndvi/map/route.ts", import.meta.url), "utf8");
const ndviRepository = await readFile(new URL("../src/lib/repositories/ndvi.ts", import.meta.url), "utf8");
const vigor = await readFile(new URL("../src/components/simple-field-vigor.tsx", import.meta.url), "utf8");
const portfolioMap = await readFile(new URL("../src/components/spatial-portfolio-map-canvas.tsx", import.meta.url), "utf8");

assert.match(loginForm, /window\.location\.replace\("\/inicio"\)/, "Login deve navegar em uma única requisição completa após Set-Cookie.");
assert.doesNotMatch(loginForm, /router\.refresh\(/, "Login não deve competir replace com refresh.");
assert.doesNotMatch(loginForm, /router\.replace\("\/dashboard"\)/, "Login não deve passar por redirect intermediário /dashboard.");

assert.match(session, /cache\(readPlatformSession\)/, "Layout e página devem compartilhar a leitura de sessão no mesmo render.");
assert.match(
  db,
  /SELECT set_config\('app\.tenant_id',[\s\S]*set_config\('app\.user_id'/,
  "Contexto RLS deve configurar tenant+user em um único round-trip SQL.",
);

assert.doesNotMatch(home, /getDashboardSnapshot/, "Home não deve executar snapshot que não renderiza.");
assert.match(home, /<Suspense/, "Dados secundários da home devem fazer streaming.");
assert.match(home, /HomePortfolioMap/, "Mapa da carteira deve ficar fora do caminho crítico do shell.");

assert.match(ndviRepository, /SNAPSHOT_SUMMARY_COLUMNS/, "Histórico NDVI deve usar projeção leve.");
assert.match(ndviRepository, /\(raster_object_key IS NOT NULL\) AS "rasterStored"/, "API deve expor só disponibilidade do raster.");
assert.match(ndviRoute, /getNdviFieldReadModel/, "NDVI deve consolidar contorno+histórico.");
assert.doesNotMatch(ndviRoute, /getLatestNdviSnapshot/, "GET/POST NDVI não deve duplicar consulta de latest fora do histórico.");
assert.match(vigor, /rasterStored\?: boolean/, "Frontend deve consumir flag leve, não object key Base64.");

assert.match(ndviMapRoute, /"cache-control": "private, no-cache"/, "Raster privado deve poder ser revalidado.");
assert.match(ndviMapRoute, /status: 304/, "Raster deve responder 304 quando ETag já está no navegador.");

assert.match(portfolioMap, /IntersectionObserver/, "Mapa da carteira deve montar provider só perto do viewport.");
assert.match(portfolioMap, /gestureHandling: "cooperative"/, "Google portfolio map não deve capturar scroll acidental.");
assert.match(portfolioMap, /scrollWheelZoom: false/, "Fallback Leaflet não deve capturar roda do mouse.");

console.log("performance-fast-path: login, sessão, home, NDVI e mapas protegidos contra regressões de latência");
