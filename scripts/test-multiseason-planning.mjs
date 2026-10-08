import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { executeMultiseasonPlan, resolvePlanningCapability, resolvePlanningScenarioPersistenceStatus, soilReanalysisStatus } from "../src/domain/multiseason-planning.ts";
assert.equal(resolvePlanningCapability("SOYBEAN").status, "PARTIAL");
assert.equal(resolvePlanningCapability("UNKNOWN").status, "UNSUPPORTED");
const noEvidence = executeMultiseasonPlan({ crops: [{ cropCode: "SOYBEAN" }], hasBaseEvidence: false });
assert.equal(noEvidence[0].limitations[0], "INSUFFICIENT_EVIDENCE");
const unresolvedDates = executeMultiseasonPlan({
  crops: [{ cropCode: "SOYBEAN" }, { cropCode: "WHEAT" }, { cropCode: "RICE" }],
  hasBaseEvidence: true,
});
assert.equal(unresolvedDates[2].status, "PARTIAL");
assert.ok(unresolvedDates[2].limitations.includes("BASE_SAMPLE_DATE_UNKNOWN"));
assert.equal(unresolvedDates[2].reanalysisRequired, false);

const plan = executeMultiseasonPlan({
  crops: [
    { cropCode: "SOYBEAN", plannedDate: "2027-10-01" },
    { cropCode: "WHEAT", plannedDate: "2028-10-01" },
    { cropCode: "RICE", plannedDate: "2029-09-15" },
  ],
  hasBaseEvidence: true,
  baseSampledFrom: "2026-09-15",
});
assert.equal(plan[0].status, "PARTIAL");
assert.equal(plan[1].status, "PARTIAL");
assert.equal(plan[2].status, "REANALYSIS_REQUIRED");
assert.equal(plan[2].reanalysisRequired, true);
assert.equal(plan[2].reanalysisDueAt, "2029-09-15");

assert.deepEqual(
  soilReanalysisStatus({ baseSampledFrom: "2026-09-15", plannedDate: null }),
  { required: false, resolved: false, limitation: "PLANNED_DATE_UNKNOWN", dueAt: "2029-09-15" },
);
assert.equal(resolvePlanningScenarioPersistenceStatus([]), "DRAFT");
assert.equal(resolvePlanningScenarioPersistenceStatus(plan), "REANALYSIS_REQUIRED");
assert.equal(
  resolvePlanningScenarioPersistenceStatus(plan.slice(0,2)),
  "CALCULATED",
);
const calculateRoute = readFileSync(new URL("../src/app/api/planning/[id]/calculate/route.ts", import.meta.url), "utf8");
const planningRoute = readFileSync(new URL("../src/app/api/planning/[id]/route.ts", import.meta.url), "utf8");
const planningDomain = readFileSync(new URL("../src/domain/multiseason-planning.ts", import.meta.url), "utf8");
assert.match(calculateRoute, /writers\.has\(s\.role\)/);
assert.match(calculateRoute, /status:403/);
assert.match(
  planningRoute,
  /const managementSystems=new Set/,
  "manejo de calagem precisa ser estruturado no boundary HTTP",
);
assert.match(
  planningRoute,
  /optionalNonNegativeNumber\(b\.yearsSinceLastLiming/,
  "anos desde a última calagem precisam ser validados como número não-negativo",
);
assert.match(
  planningRoute,
  /nullableBoolean\(b\.limingAgronomistConfirmedIncorporation/,
  "confirmação agronômica deve preservar UNKNOWN em vez de converter para false",
);
assert.doesNotMatch(
  planningDomain,
  /position\s*>=\s*2/,
  "posição do cultivo não pode definir sozinha quando a reanálise vence",
);
assert.match(
  planningDomain,
  /SOIL_REANALYSIS_MAX_YEARS = 3/,
  "prazo homologado precisa estar explícito e versionável no domínio",
);

const repository = readFileSync(new URL("../src/lib/repositories/planning.ts", import.meta.url), "utf8");
const editor = readFileSync(new URL("../src/components/planning-scenario-editor.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../db/migrations/047_multiseason_planning.sql", import.meta.url), "utf8");
const planningWorkspace = readFileSync(new URL("../src/components/planning-workspace.tsx", import.meta.url), "utf8");
const declaredContextMigration = readFileSync(new URL("../db/migrations/048_multiseason_declared_context.sql", import.meta.url), "utf8");
const previousCropMigration = readFileSync(new URL("../db/migrations/049_multiseason_previous_crop_code.sql", import.meta.url), "utf8");
const limingContextMigration = readFileSync(new URL("../db/migrations/050_multiseason_liming_context.sql", import.meta.url), "utf8");
const commercialSnapshotMigration = readFileSync(new URL("../db/migrations/051_multiseason_commercial_snapshots.sql", import.meta.url), "utf8");
const agroclimateSnapshotMigration = readFileSync(new URL("../db/migrations/052_multiseason_agroclimate_snapshots.sql", import.meta.url), "utf8");
const planningCommercialRepository = readFileSync(new URL("../src/lib/repositories/planning-commercial.ts", import.meta.url), "utf8");
const planningCommercialPanel = readFileSync(new URL("../src/components/planning-commercial-panel.tsx", import.meta.url), "utf8");
const planningCommercialSimulationRoute = readFileSync(new URL("../src/app/api/planning/[id]/crops/[cropId]/commercial-simulation/route.ts", import.meta.url), "utf8");
const planningCommercialSnapshotsRoute = readFileSync(new URL("../src/app/api/planning/[id]/crops/[cropId]/commercial-snapshots/route.ts", import.meta.url), "utf8");
const planningAgroclimateRepository = readFileSync(new URL("../src/lib/repositories/planning-agroclimate.ts", import.meta.url), "utf8");
const planningZarcPanel = readFileSync(new URL("../src/components/planning-zarc-panel.tsx", import.meta.url), "utf8");
const planningZarcRoute = readFileSync(new URL("../src/app/api/planning/[id]/crops/[cropId]/zarc/route.ts", import.meta.url), "utf8");

assert.match(
  repository,
  /cs\.field_id=f\.id/,
  "análise-base precisa pertencer ao mesmo talhão do cenário",
);
assert.match(
  repository,
  /AS "baseEvidenceReady"/,
  "cenário precisa distinguir análise vinculada de evidência laboratorial realmente disponível",
);
assert.match(
  repository,
  /JOIN lab_results plr/,
  "readiness da análise-base deve depender de resultados laboratoriais persistidos",
);
assert.match(
  repository,
  /min\(ls\.sampled_at\)::text AS "sampledFrom"/,
  "data técnica da análise-base deve vir da amostragem laboratorial",
);
assert.match(
  repository,
  /max\(ls\.sampled_at\)::text AS "sampledTo"/,
  "múltiplas datas de amostragem devem preservar intervalo real",
);
assert.doesNotMatch(
  editor,
  /baseAnalysisCreatedAt/,
  "created_at do cadastro não pode ser exibido como data técnica da análise",
);
assert.match(
  repository,
  /hasBaseEvidence:Boolean\(scenario\.baseEvidenceReady\)/,
  "orquestração fail-closed deve usar evidência real e não apenas UUID da análise",
);
assert.match(
  repository,
  /runAgronomicEngine\(\{cropProfile:profile,labResults\}\)/,
  "plurissafras deve reprocessar o laudo-base com o perfil da cultura planejada",
);
assert.match(
  repository,
  /computePlanningPkTargets\(/,
  "P/K do planejamento deve reutilizar o motor determinístico oficial",
);
assert.match(
  repository,
  /computePlanningSulfurTarget\(/,
  "S do planejamento deve reutilizar os motores determinísticos existentes",
);
assert.match(
  repository,
  /computePlanningNitrogenTarget\(/,
  "N do planejamento deve reutilizar o motor determinístico existente",
);
assert.match(
  repository,
  /computePlanningLimingTarget\(/,
  "calagem inicial deve reutilizar o motor determinístico oficial",
);
assert.match(
  repository,
  /computePlanningMicronutrients\(/,
  "micronutrientes devem reutilizar classificação determinística com dose nula",
);
assert.match(
  repository,
  /summarizeInitialPlanningLiming\(/,
  "calcário deve ser resumido como intervenção inicial, não acumulado por safra",
);
assert.match(
  repository,
  /result\.position===0\s*\? scenario\.previousCropCode\?\?null\s*:\s*scenario\.crops\[result\.position-1\]\?\.cropCode\?\?null/,
  "primeiro cultivo usa predecessor estruturado e os seguintes usam a própria sequência",
);
assert.doesNotMatch(
  repository,
  /precedingCropCode=result\.position===0[\s\S]{0,120}scenario\.previousCrop\b/,
  "texto livre de cultura anterior não pode alimentar automaticamente o motor de N",
);
assert.match(
  repository,
  /summarizePlanningNitrogenResults\(/,
  "cálculo/snapshot deve preservar o acumulado conhecido de N",
);
assert.match(
  repository,
  /summarizePlanningSulfurResults\(/,
  "snapshot/cálculo deve preservar o acumulado conhecido de S",
);
assert.match(
  repository,
  /cultivationOrderAfterSoilAnalysis:result\.position\+1/,
  "ordem do cultivo precisa ser explícita no motor P/K",
);
assert.match(
  repository,
  /FOR SHARE/,
  "cálculo/snapshot deve bloquear mudança concorrente da análise-base enquanto deriva doses",
);
assert.match(
  planningWorkspace,
  /baseAnalysisId:baseAnalysisId\|\|null/,
  "workspace deve enviar explicitamente a análise-base escolhida",
);
assert.match(
  planningWorkspace,
  /analysis\.fieldId===fieldId/,
  "seletor de análise-base deve ficar restrito ao talhão escolhido",
);
assert.match(
  repository,
  /getPlanningScenarioWithClient\(c,input\.tenantId,input\.scenarioId\)/,
  "lifecycle deve reler o cenário dentro da mesma transação tenant-scoped",
);
assert.match(
  repository,
  /FOR UPDATE/,
  "mutações concorrentes do cenário precisam serializar a posição dos cultivos",
);
for (const auditAction of [
  "PLANNING_CROP_ADDED",
  "PLANNING_CROP_UPDATED",
  "PLANNING_CROP_REMOVED",
  "PLANNING_CROPS_REORDERED",
  "PLANNING_SCENARIO_CALCULATED",
  "PLANNING_SCENARIO_SNAPSHOT_CREATED",
]) {
  assert.match(repository, new RegExp(auditAction), `auditoria ausente: ${auditAction}`);
}
assert.match(
  repository,
  /SET status='DRAFT'/,
  "edições precisam invalidar o estado calculado anterior",
);
assert.match(
  repository,
  /const scenario=await getPlanningScenarioWithClient\(c,tenantId,scenarioId\)/,
  "snapshot deve congelar cenário e cálculo dentro da mesma transação",
);
assert.doesNotMatch(
  editor,
  /target=60|nutrient=K2O/,
  "planejamento sem dose calculada não pode inventar alvo K2O para a calculadora",
);
assert.match(
  editor,
  /new URLSearchParams\(\)/,
  "integração com a calculadora deve montar parâmetros explicitamente",
);
assert.match(
  editor,
  /params\.set\("area",String\(areaHa\)\)/,
  "área pode ser transportada como contexto neutro",
);
assert.match(
  editor,
  /target\?\.ready&&target\.minimumKgPerHa===target\.maximumKgPerHa/,
  "alvo só pode ser enviado à calculadora quando a dose determinística é exata",
);
assert.match(
  migration,
  /REVOKE UPDATE, DELETE ON planning_scenario_snapshots FROM raiz_app/,
  "runtime não pode alterar ou apagar snapshots de planejamento",
);
assert.match(
  migration,
  /planning_scenario_snapshots_immutable/,
  "imutabilidade do snapshot precisa existir também no banco",
);
assert.match(
  declaredContextMigration,
  /ADD COLUMN management_system text/,
  "contexto declarado precisa ser persistido sem inferir manejo",
);
assert.match(declaredContextMigration, /ADD COLUMN irrigation_type text/);
assert.match(declaredContextMigration, /ADD COLUMN recent_crop_history text/);
assert.match(declaredContextMigration, /ADD COLUMN fertilization_history text/);
assert.match(declaredContextMigration, /ADD COLUMN organic_inputs text/);
assert.match(
  previousCropMigration,
  /ADD COLUMN previous_crop_code text/,
  "categoria estruturada da cultura anterior precisa existir separada do texto livre",
);
assert.match(
  previousCropMigration,
  /SOYBEAN','CORN','OTHER/,
  "cultura anterior estruturada deve usar enum fechado e UNKNOWN como null",
);
assert.match(
  limingContextMigration,
  /ADD COLUMN years_since_last_liming numeric/,
  "anos desde a última calagem precisam ser campo estruturado",
);
for (const column of [
  "liming_yield_below_local_average_drought",
  "liming_compaction_restricts_root_growth",
  "liming_phosphorus_10_20_below_critical",
  "liming_agronomist_confirmed_incorporation",
]) {
  assert.match(limingContextMigration, new RegExp(column), `contexto estruturado de calagem ausente: ${column}`);
}
assert.match(
  commercialSnapshotMigration,
  /CREATE TABLE planning_crop_commercial_snapshots/,
  "cenário comercial plurissafras precisa de snapshot próprio por cultivo",
);
assert.match(
  commercialSnapshotMigration,
  /FOREIGN KEY \(tenant_id, scenario_id, planning_crop_id\)/,
  "snapshot comercial precisa estar ligado ao tenant, cenário e cultivo juntos",
);
assert.match(
  commercialSnapshotMigration,
  /REVOKE UPDATE, DELETE ON planning_crop_commercial_snapshots FROM raiz_app/,
  "runtime não pode reescrever histórico comercial do planejamento",
);
assert.match(
  commercialSnapshotMigration,
  /planning_crop_commercial_snapshots_immutable/,
  "imutabilidade comercial precisa existir também no PostgreSQL",
);
assert.match(
  editor,
  /Data prevista/,
  "cada cultivo deve expor a data prevista já existente no modelo",
);
assert.match(
  editor,
  /Condição hídrica/,
  "cada cultivo deve distinguir irrigado, sequeiro e não informado",
);
assert.match(
  editor,
  /Eles não criam doses, clima ou efeito residual por conta própria/,
  "entrevista declarada não pode ser apresentada como regra agronômica",
);
assert.match(
  editor,
  /P₂O₅ → produto/,
  "dose exata calculada deve poder alimentar a calculadora comercial",
);
assert.match(
  editor,
  /Enxofre conhecido do horizonte/,
  "UI deve separar o acumulado conhecido de S",
);
assert.match(
  editor,
  /Categoria da cultura anterior/,
  "entrevista precisa expor predecessor estruturado para o primeiro cultivo",
);
assert.match(
  editor,
  /motor de N usa somente a categoria estruturada acima/,
  "UI deve deixar explícito que texto livre não alimenta N",
);
assert.match(
  editor,
  /Nitrogênio conhecido do horizonte/,
  "UI deve separar o acumulado conhecido de N",
);
assert.match(
  editor,
  /Anos desde a última calagem/,
  "entrevista precisa manter histórico de calagem em campo estruturado",
);
assert.match(
  editor,
  /texto livre de “última correção” não é convertido automaticamente em anos/,
  "texto histórico não pode alimentar silenciosamente o motor de calagem",
);
assert.match(
  editor,
  /Calagem inicial do cenário/,
  "UI deve apresentar calcário como intervenção inicial separada",
);
assert.match(
  editor,
  /Micronutrientes · classificação analítica, sem dose automática/,
  "UI deve deixar explícito que micronutrientes não têm dose automática",
);
assert.match(
  editor,
  /“Baixo” não é convertido em kg\/ha/,
  "classe baixa não pode virar dose por inferência",
);
assert.doesNotMatch(
  editor,
  /calculatorHref\("(?:B|ZN|CU|MN)"/,
  "micronutrientes não podem alimentar a calculadora sem regra de dose",
);
assert.match(
  editor,
  /necessidade da camada; aplicação não definida/,
  "necessidade de camada não pode ser apresentada como recomendação de aplicação",
);
assert.match(
  editor,
  /commercialTargetTonHaPrnt100/,
  "botão comercial de calcário deve depender de alvo explicitamente autorizado",
);
assert.match(
  editor,
  /mode","LIME"/,
  "handoff do calcário deve abrir explicitamente o modo PRNT da calculadora",
);
assert.match(
  editor,
  /limeRequirement/,
  "somente a necessidade PRNT100 autorizada pode ser enviada à calculadora",
);
assert.match(
  editor,
  /calculatorHref\("N",nitrogen,scenario\.areaHa\)/,
  "N determinístico pode alimentar a calculadora sem alvo inventado",
);
assert.match(
  editor,
  /calculatorHref\("S",sulfur,scenario\.areaHa\)/,
  "S determinístico pode alimentar a calculadora sem alvo inventado",
);
assert.match(
  editor,
  /Parcial|parcial:/i,
  "acumulado deve deixar explícito quando existem cultivos bloqueados",
);
assert.doesNotMatch(
  editor,
  /target=60/,
  "nenhum alvo fixo pode reaparecer na integração com a calculadora",
);
assert.match(
  editor,
  /setResults\(\[\]\);\s*setAccumulatedPk\(null\)/,
  "acumulado antigo não pode continuar visível depois que o cenário muda",
);
console.log("multiseason-planning: capability, evidência, base por talhão, snapshot imutável e ausência de alvo inventado aprovados");

assert.match(
  planningCommercialRepository,
  /computeSingleProductRateFromNutrient/,
  "comercial plurissafras deve reutilizar o motor comercial existente",
);
assert.match(
  planningCommercialRepository,
  /solveTwoProductPkPlan/,
  "cenário P\/K deve reutilizar o solver comercial existente",
);
assert.match(
  planningCommercialRepository,
  /convertLimingRequirementToCommercialProduct/,
  "calcário comercial deve reutilizar conversão PRNT existente",
);
assert.match(
  planningCommercialRepository,
  /sourceScenarioUpdatedAt[\s\S]*sourceCropUpdatedAt/,
  "snapshot comercial precisa detectar cenário/cultivo alterado durante a simulação",
);
assert.match(
  planningCommercialRepository,
  /PLANNING_CROP_COMMERCIAL_SNAPSHOT_SAVED/,
  "salvamento comercial por cultivo precisa ser auditado",
);
assert.match(
  planningCommercialPanel,
  /O produto e o preço são escolhas explícitas/,
  "UI deve separar decisão comercial de necessidade agronômica",
);
assert.match(
  planningCommercialPanel,
  /Faixas e bloqueios permanecem técnicos/,
  "UI não pode transformar faixa em compra",
);
assert.match(
  planningCommercialPanel,
  /Salvar cenário deste cultivo/,
  "usuário precisa poder congelar alternativas comerciais por cultivo",
);
assert.match(
  editor,
  /PlanningCommercialPanel/,
  "camada comercial precisa estar ligada a cada cultivo calculado",
);
assert.match(
  planningCommercialSimulationRoute,
  /getPlanningCommercialWorkspace/,
  "GET comercial por cultivo deve recalcular workspace tenant-scoped",
);
assert.match(
  planningCommercialSimulationRoute,
  /simulatePlanningCommercialPlan/,
  "POST comercial deve simular no servidor",
);
assert.match(
  planningCommercialSnapshotsRoute,
  /SAVE_ROLES/,
  "snapshot comercial deve preservar RBAC explícito",
);
assert.match(
  planningCommercialSnapshotsRoute,
  /savePlanningCommercialSnapshot/,
  "snapshot deve ser recalculado e salvo no servidor",
);

assert.match(
  agroclimateSnapshotMigration,
  /CREATE TABLE planning_crop_agroclimate_snapshots/,
  "ZARC por cultivo precisa de snapshot próprio e imutável",
);
assert.match(
  agroclimateSnapshotMigration,
  /REVOKE UPDATE, DELETE ON planning_crop_agroclimate_snapshots FROM raiz_app/,
  "runtime não pode reescrever evidência ZARC congelada",
);
assert.match(
  agroclimateSnapshotMigration,
  /planning_crop_agroclimate_snapshots_immutable/,
  "imutabilidade ZARC precisa existir no PostgreSQL",
);
assert.match(
  planningAgroclimateRepository,
  /process\.env\.AGROAPI_ACCESS_TOKEN/,
  "consulta Agritec deve depender de credencial de servidor, nunca de valor do cliente",
);
assert.doesNotMatch(
  planningAgroclimateRepository,
  /NEXT_PUBLIC_AGROAPI/,
  "token Agritec não pode ser público",
);
assert.match(
  planningAgroclimateRepository,
  /resolveAgritecMunicipalityExact/,
  "município ZARC deve ser ligado por resolução oficial exata",
);
assert.match(
  planningAgroclimateRepository,
  /resolveAgritecCultureExact/,
  "cultura ZARC deve ser ligada por resolução oficial exata",
);
assert.match(
  planningAgroclimateRepository,
  /PLANNING_CHANGED_DURING_ZARC_FETCH/,
  "mudança concorrente deve invalidar a captura ZARC antes de persistir",
);
assert.match(
  planningAgroclimateRepository,
  /PLANNING_CROP_ZARC_SNAPSHOT_CREATED/,
  "captura ZARC precisa ser auditada",
);
assert.match(
  planningAgroclimateRepository,
  /source_scenario_updated_at=ps\.updated_at[\s\S]*source_crop_updated_at=pc\.updated_at/,
  "histórico ZARC precisa distinguir evidência atual de evidência histórica",
);
assert.match(
  repository,
  /getCompatiblePlanningAgroclimateSnapshotsWithClient/,
  "snapshot plurissafras deve congelar somente evidência ZARC compatível com sua versão",
);
assert.match(
  repository,
  /agroclimateByCrop/,
  "evidência ZARC compatível deve entrar no payload hashado do planejamento",
);
assert.match(
  planningZarcPanel,
  /ZARC é zoneamento de risco de plantio/,
  "UI deve explicar a semântica de risco ZARC",
);
assert.match(
  planningZarcPanel,
  /não aumenta ou reduz dose de fertilizante automaticamente/,
  "ZARC não pode alterar dose por inferência",
);
assert.match(
  planningZarcPanel,
  /credencial Agritec\/Embrapa não configurada/,
  "ausência da credencial deve degradar apenas o bloco climático",
);
assert.match(
  editor,
  /PlanningZarcPanel/,
  "ZARC oficial deve ficar vinculado a cada cultivo do planejamento",
);
assert.match(
  planningZarcRoute,
  /writers\.has\(session\.role\)/,
  "atualização ZARC deve respeitar o RBAC do planejamento",
);
assert.match(
  planningZarcRoute,
  /refreshPlanningCropZarcSnapshot/,
  "POST ZARC deve consultar e congelar evidência no servidor",
);
