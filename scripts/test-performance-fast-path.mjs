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
const fieldOverviewRepo = await readFile(new URL("../src/lib/repositories/field-overview.ts", import.meta.url), "utf8");
const fieldPage = await readFile(new URL("../src/app/(platform)/talhoes/[fieldId]/page.tsx", import.meta.url), "utf8");
const simpleFieldOverview = await readFile(new URL("../src/components/simple-field-overview.tsx", import.meta.url), "utf8");
const deferredFieldOverview = await readFile(new URL("../src/components/deferred-field-overview-tabs.tsx", import.meta.url), "utf8");
const deliveryStatus = await readFile(new URL("../src/lib/repositories/decision-delivery-status.ts", import.meta.url), "utf8");
const resultsPage = await readFile(new URL("../src/app/(platform)/resultados/page.tsx", import.meta.url), "utf8");
const resultsOverview = await readFile(new URL("../src/lib/repositories/results-overview.ts", import.meta.url), "utf8");
const alertsRepository = await readFile(new URL("../src/lib/repositories/alerts.ts", import.meta.url), "utf8");
const alertsReadModel = await readFile(new URL("../src/lib/repositories/alerts-read-model.ts", import.meta.url), "utf8");

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


// Talhão 360°: abertura rápida, histórico sob demanda e sem central global de alertas no SSR.
assert.match(fieldPage, /getFieldOverviewCore/, "Talhão 360 deve usar o read model rápido no primeiro render.");
assert.doesNotMatch(fieldPage, /listOperationalAlerts/, "Talhão 360 não pode bloquear o SSR esperando alertas globais.");
assert.match(simpleFieldOverview, /DeferredFieldOverviewTabs/, "Histórico técnico deve permanecer atrás do componente deferido.");
assert.doesNotMatch(simpleFieldOverview, /technicalOpened/, "Pai não deve depender de estado de clique que pode ser perdido antes da hidratação.");
assert.match(deferredFieldOverview, /closest\("details"\)/, "Componente deferido deve sincronizar com o estado nativo do details.");
assert.match(deferredFieldOverview, /addEventListener\("toggle"/, "Componente deferido deve reagir à abertura real do details.");
assert.match(deferredFieldOverview, /if \(!active \|\| details \|\| error\) return;/, "Fetch técnico não deve ocorrer enquanto a seção estiver fechada.");
assert.match(fieldOverviewRepo, /export async function getFieldOverviewCore/, "Read model rápido precisa existir.");
assert.match(fieldOverviewRepo, /export async function getFieldOverviewTechnicalDetails/, "Histórico técnico precisa ter read model separado.");
assert.doesNotMatch(deliveryStatus, /information_schema\.columns/, "Estado de entrega não deve introspectar schema em toda abertura.");

const coreStart = fieldOverviewRepo.indexOf("export async function getFieldOverviewCore");
const technicalStart = fieldOverviewRepo.indexOf("export async function getFieldOverviewTechnicalDetails");
const coreBlock = fieldOverviewRepo.slice(coreStart, technicalStart);
const technicalBlock = fieldOverviewRepo.slice(technicalStart);
assert.equal((coreBlock.match(/client\.query\(/g) ?? []).length, 1, "Overview rápido do Talhão 360 deve usar uma única query de domínio.");
assert.equal((technicalBlock.match(/client\.query\(/g) ?? []).length, 1, "Detalhes técnicos devem usar uma única query de domínio.");


// Resultados: uma única leitura tenant-scoped para publicados + análises + estado corrente.
assert.match(resultsPage, /getResultsOverview/, "Resultados deve usar read model consolidado.");
assert.doesNotMatch(resultsPage, /listPublishedReports|listAnalyses|getDecisionDeliveryStatuses/, "Resultados não deve abrir três contextos tenant separados.");
assert.equal((resultsOverview.match(/client\.query/g) ?? []).length, 1, "Read model de Resultados deve usar uma única query de domínio.");


// Atenção: todas as categorias preservadas com uma única ida ao banco.
assert.match(alertsRepository, /getOperationalAlertSources/, "Central de Atenção deve consumir read model agregado.");
assert.doesNotMatch(alertsRepository, /client\.query\(/, "Montagem de alertas não deve voltar a disparar queries por categoria.");
assert.equal((alertsReadModel.match(/client\.query/g) ?? []).length, 1, "Fontes da Central de Atenção devem sair de uma única query de domínio.");
assert.match(alertsReadModel, /overdueOrders/);
assert.match(alertsReadModel, /pendingPoints/);
assert.match(alertsReadModel, /staleCurrentInterpretations/);
assert.match(alertsReadModel, /inputDeviation/);
assert.match(alertsReadModel, /climateSeasons/);

console.log("performance-fast-path: login, sessão, home, NDVI, mapas, Talhão 360, Resultados e Atenção protegidos contra regressões de latência");
