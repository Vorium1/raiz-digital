/**
 * Ensaio HTTP do fluxo REAL já persistido de Cabeda / Área 01 / AN-CABEDA-01.
 *
 * Objetivo: exercitar o mesmo caminho da aplicação sem duplicar o laudo e sem fingir revisão humana:
 * localizar análise -> conferir freshness -> recalcular com regras atuais quando autorizado -> preparar
 * conclusão determinística local -> checar revisão e gate da entrega.
 *
 * NUNCA aprova interpretação, NUNCA aprova prescrição e NUNCA publica relatório. Esses três atos são
 * decisões profissionais e continuam fora da automação. Escritas de máquina (recalcular/gerar rascunho)
 * só acontecem com RAIZ_REHEARSAL_WRITE=true E confirmação explícita de ambiente não produtivo.
 */
const BASE_URL = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@raiz.local";
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const ANALYSIS_CODE = process.env.RAIZ_REHEARSAL_ANALYSIS_CODE ?? "AN-CABEDA-01";
const EXPECTED_FIELD = process.env.RAIZ_REHEARSAL_FIELD ?? "Área 01";
const WRITE = process.env.RAIZ_REHEARSAL_WRITE === "true";
const CONFIRM_NON_PRODUCTION = process.env.RAIZ_REHEARSAL_CONFIRM_NON_PRODUCTION === "YES";

if (!PASSWORD) throw new Error("Defina E2E_ADMIN_PASSWORD no ambiente; a senha nunca deve entrar no repositório.");

const url = new URL(BASE_URL);
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
if (WRITE && !isLocal && !CONFIRM_NON_PRODUCTION) {
  throw new Error("Escrita remota bloqueada. Confirme um Preview/homologação com RAIZ_REHEARSAL_CONFIRM_NON_PRODUCTION=YES.");
}
if (WRITE && (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production")) {
  throw new Error("Ensaio com escrita bloqueado em ambiente identificado como production.");
}

const summary = {
  baseUrl: BASE_URL,
  mode: WRITE ? "NON_PRODUCTION_WRITE_REHEARSAL" : "READ_ONLY_AUDIT",
  target: { analysisCode: ANALYSIS_CODE, field: EXPECTED_FIELD },
  stages: [],
  blockers: [],
};

function stage(name, status, detail = null) {
  summary.stages.push({ name, status, detail });
}
function blocker(code, detail) {
  if (!summary.blockers.some((item) => item.code === code)) summary.blockers.push({ code, detail });
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, { redirect: "manual", ...options });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { res, body };
}

async function login() {
  const { res, body } = await request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login falhou: HTTP ${res.status} ${typeof body === "string" ? body.slice(0, 200) : JSON.stringify(body)}`);
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("Login não devolveu cookie de sessão.");
  return setCookie.split(";")[0];
}

async function authed(cookie, path, options = {}) {
  return request(path, { ...options, headers: { cookie, ...(options.headers ?? {}) } });
}

const cookie = await login();
stage("login", "OK");

const analysesResponse = await authed(cookie, "/api/analyses");
if (!analysesResponse.res.ok) throw new Error(`Falha ao listar análises: HTTP ${analysesResponse.res.status}`);
const matches = (analysesResponse.body?.analyses ?? []).filter((item) => item.code === ANALYSIS_CODE && item.fieldName === EXPECTED_FIELD);
if (matches.length === 0) {
  stage("locate-analysis", "FAIL", "Análise-alvo não encontrada.");
  blocker("ANALYSIS_NOT_FOUND", `Não existe ${ANALYSIS_CODE} em ${EXPECTED_FIELD}; rode primeiro o fluxo de importação real em homologação.`);
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = 2;
} else if (matches.length > 1) {
  stage("locate-analysis", "FAIL", `${matches.length} análises com o mesmo código/talhão.`);
  blocker("DUPLICATE_ANALYSIS_CODE", "Há duplicidade do alvo; não escolher automaticamente uma análise ambígua.");
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = 2;
} else {
  const analysis = matches[0];
  stage("locate-analysis", "OK", { id: analysis.id, code: analysis.code, fieldName: analysis.fieldName, status: analysis.status });

  let interp = await authed(cookie, `/api/analyses/${analysis.id}/interpretation`);
  if (!interp.res.ok) throw new Error(`Falha ao ler interpretação: HTTP ${interp.res.status}`);
  let latestInterpretation = interp.body?.latest ?? null;

  if (!latestInterpretation && WRITE) {
    const calculated = await authed(cookie, `/api/analyses/${analysis.id}/interpret?draft=local`, { method: "POST" });
    stage("deterministic-engine", calculated.res.ok ? "OK" : "FAIL", calculated.res.ok ? "Interpretação calculada." : calculated.body);
    if (calculated.res.ok) {
      interp = await authed(cookie, `/api/analyses/${analysis.id}/interpretation`);
      latestInterpretation = interp.body?.latest ?? null;
    }
  } else if (latestInterpretation) {
    stage("deterministic-engine", "OK", {
      interpretationId: latestInterpretation.id,
      status: latestInterpretation.status,
      revision: latestInterpretation.revision,
      confidence: latestInterpretation.structuredOutput?.confidence ?? null,
      pendencies: latestInterpretation.structuredOutput?.pendencies?.length ?? null,
    });
  } else {
    stage("deterministic-engine", "NOT_RUN", "Modo somente leitura e nenhuma interpretação existente.");
    blocker("INTERPRETATION_MISSING", "Ative RAIZ_REHEARSAL_WRITE=true em homologação para calcular a interpretação.");
  }

  let prescription = await authed(cookie, `/api/analyses/${analysis.id}/agronomic-prescription`);
  if (!prescription.res.ok) throw new Error(`Falha ao ler recomendação: HTTP ${prescription.res.status}`);
  let latestPrescription = prescription.body?.latest ?? null;
  let readiness = prescription.body?.readiness ?? null;
  const interpretationFreshness = readiness?.interpretationEvidenceFreshness ?? null;

  if (latestInterpretation && interpretationFreshness?.current === false) {
    stage("interpretation-freshness", "STALE", {
      code: interpretationFreshness.code ?? null,
      reason: interpretationFreshness.reason ?? null,
    });
    if (WRITE) {
      const refreshed = await authed(cookie, `/api/analyses/${analysis.id}/interpret?draft=local`, { method: "POST" });
      stage("deterministic-self-heal", refreshed.res.ok ? "OK" : "FAIL", refreshed.res.ok
        ? { interpretationId: refreshed.body?.interpretation?.id, status: refreshed.body?.interpretation?.status, draftState: refreshed.body?.prescriptionDraftState }
        : refreshed.body);
      if (refreshed.res.ok) {
        interp = await authed(cookie, `/api/analyses/${analysis.id}/interpretation`);
        latestInterpretation = interp.body?.latest ?? null;
        prescription = await authed(cookie, `/api/analyses/${analysis.id}/agronomic-prescription`);
        latestPrescription = prescription.body?.latest ?? null;
        readiness = prescription.body?.readiness ?? null;
      }
    } else {
      blocker("INTERPRETATION_STALE", interpretationFreshness.reason ?? "A interpretação precisa ser atualizada pelas regras correntes.");
    }
  } else if (latestInterpretation) {
    stage("interpretation-freshness", "CURRENT");
  }

  // Parecer: pode ser gerado a partir da interpretação calculada; não muda recomendação oficial.
  let narrative = await authed(cookie, `/api/analyses/${analysis.id}/agronomic-narrative`);
  if (!narrative.res.ok) throw new Error(`Falha ao ler parecer: HTTP ${narrative.res.status}`);
  let latestNarrative = narrative.body?.latest ?? null;
  if (!latestNarrative && latestInterpretation && WRITE) {
    const generated = await authed(cookie, `/api/analyses/${analysis.id}/agronomic-narrative`, { method: "POST" });
    stage("agronomic-opinion", generated.res.ok ? "OK" : "FAIL", generated.res.ok ? { generationId: generated.body?.generation?.id, isRealLanguageModel: generated.body?.isRealLanguageModel } : generated.body);
    if (generated.res.ok) {
      narrative = await authed(cookie, `/api/analyses/${analysis.id}/agronomic-narrative`);
      latestNarrative = narrative.body?.latest ?? null;
    }
  } else if (latestNarrative) {
    stage("agronomic-opinion", "OK", { generationId: latestNarrative.id, status: latestNarrative.status, provider: latestNarrative.provider, model: latestNarrative.model });
  } else if (latestInterpretation) {
    stage("agronomic-opinion", "NOT_RUN", "Parecer ainda não gerado; modo somente leitura.");
  }

  // Conclusão: rascunho pode existir em IN_REVIEW ou APPROVED, sempre PENDING_REVIEW.
  // O ensaio força o modo determinístico local para nunca consumir LLM externo.

  if (readiness?.allowed && WRITE && (!latestPrescription || latestPrescription.status === "CHANGES_REQUESTED")) {
    const generated = await authed(cookie, `/api/analyses/${analysis.id}/agronomic-prescription?mode=deterministic`, { method: "POST" });
    stage("technical-conclusion-draft", generated.res.ok ? "OK" : "FAIL", generated.res.ok ? {
      generationId: generated.body?.generation?.id,
      isRealLanguageModel: generated.body?.isRealLanguageModel,
      recommendationCount: generated.body?.prescription?.recommendations?.length ?? 0,
      missingInformation: generated.body?.prescription?.missingInformation ?? [],
    } : generated.body);
    if (generated.res.ok) {
      prescription = await authed(cookie, `/api/analyses/${analysis.id}/agronomic-prescription`);
      latestPrescription = prescription.body?.latest ?? null;
    } else {
      blocker("PRESCRIPTION_PROVIDER_FAILED", typeof generated.body?.error === "string" ? generated.body.error : "Falha no provedor de prescrição.");
    }
  } else if (latestPrescription) {
    stage("technical-conclusion-draft", "OK", { generationId: latestPrescription.id, status: latestPrescription.status, provider: latestPrescription.provider, model: latestPrescription.model });
  } else if (!readiness?.allowed) {
    stage("technical-conclusion-draft", "BLOCKED", readiness?.reason ?? "Interpretação ainda não aprovada.");
  } else {
    stage("technical-conclusion-draft", "NOT_RUN", "Pronta para gerar, mas o ensaio está em modo somente leitura.");
  }

  if (latestInterpretation?.status !== "APPROVED") {
    blocker("HUMAN_INTERPRETATION_REVIEW_REQUIRED", `Interpretação está em ${latestInterpretation?.status ?? "AUSENTE"}; a automação não substitui o responsável técnico.`);
  }
  if (latestPrescription && latestPrescription.status !== "APPROVED") {
    blocker("HUMAN_PRESCRIPTION_REVIEW_REQUIRED", `Recomendação está em ${latestPrescription.status}; revisar antes de qualquer recomendação oficial.`);
  }

  const canPublish = latestInterpretation?.status === "APPROVED" && latestPrescription?.status === "APPROVED";
  stage("official-report-gate", canPublish ? "READY" : "BLOCKED", canPublish
    ? "Interpretação e recomendação já estão aprovadas. Este ensaio ainda não publica automaticamente."
    : "Entrega oficial permanece bloqueada até as duas aprovações profissionais.");

  if (!canPublish) blocker("OFFICIAL_REPORT_NOT_READY", "Relatório oficial não deve ser publicado automaticamente neste estado.");

  console.log(JSON.stringify(summary, null, 2));
}
