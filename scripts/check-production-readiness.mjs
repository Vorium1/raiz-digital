import { pathToFileURL } from "node:url";

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hasPlaceholder(value) {
  const normalized = clean(value).toLowerCase();
  return !normalized || ["troque", "changeme", "example", "seudominio", "localhost", "raiz:raiz"].some((marker) => normalized.includes(marker));
}

function parseDatabaseUrl(value) {
  try {
    const parsed = new URL(value);
    if (!/^postgres(?:ql)?:$/.test(parsed.protocol)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function evaluateS3(env) {
  const endpointRaw = clean(env.S3_ENDPOINT);
  let endpoint = null;
  try { endpoint = endpointRaw ? new URL(endpointRaw) : null; } catch { endpoint = null; }
  const bucket = clean(env.S3_BUCKET);
  const accessKey = clean(env.S3_ACCESS_KEY);
  const secretKey = clean(env.S3_SECRET_KEY);
  const region = clean(env.S3_REGION || "auto");
  const ok = Boolean(
    endpoint &&
    endpoint.protocol === "https:" &&
    (!endpoint.pathname || endpoint.pathname === "/") &&
    !hasPlaceholder(bucket) &&
    !hasPlaceholder(accessKey) &&
    !hasPlaceholder(secretKey) &&
    !hasPlaceholder(region)
  );
  return { ok };
}

export function evaluateProductionReadiness(env = process.env) {
  const checks = [];
  const failures = [];
  const warnings = [];

  function pass(name, message) {
    checks.push({ level: "PASS", name, message });
  }
  function fail(name, message) {
    checks.push({ level: "FAIL", name, message });
    failures.push({ name, message });
  }
  function warn(name, message) {
    checks.push({ level: "WARN", name, message });
    warnings.push({ name, message });
  }

  if (clean(env.DATA_MODE) === "database") pass("data-mode", "Runtime usa dados persistidos.");
  else fail("data-mode", "DATA_MODE precisa ser database no ambiente comercial.");

  const appDbRaw = clean(env.APP_DATABASE_URL);
  const appDb = parseDatabaseUrl(appDbRaw);
  if (!appDb) {
    fail("app-database", "APP_DATABASE_URL precisa ser uma URL PostgreSQL válida e explícita.");
  } else if (["localhost", "127.0.0.1", "::1"].includes(appDb.hostname)) {
    fail("app-database", "APP_DATABASE_URL aponta para host local.");
  } else if (!appDb.username) {
    fail("app-database", "APP_DATABASE_URL precisa usar um papel de banco identificado.");
  } else {
    pass("app-database", "Runtime tem conexão PostgreSQL remota explícita.");
  }

  const adminDbRaw = clean(env.DATABASE_URL);
  const adminDb = parseDatabaseUrl(adminDbRaw);
  if (!adminDbRaw) {
    warn("migration-database", "DATABASE_URL administrativo não está neste ambiente; migrations precisarão de uma etapa separada com credencial própria.");
  } else if (!adminDb) {
    fail("migration-database", "DATABASE_URL está definido, mas não é uma URL PostgreSQL válida.");
  } else if (appDb && adminDb.username === appDb.username) {
    fail("least-privilege", "APP_DATABASE_URL e DATABASE_URL usam o mesmo usuário; o runtime deve usar o papel restrito da aplicação.");
  } else {
    pass("least-privilege", "Credenciais de runtime e administração estão separadas.");
  }

  if (clean(env.DATABASE_SSL).toLowerCase() === "require") pass("database-ssl", "TLS do banco está exigido.");
  else fail("database-ssl", "DATABASE_SSL precisa ser require em produção.");

  const authSecret = clean(env.AUTH_SECRET);
  if (authSecret.length >= 32 && !hasPlaceholder(authSecret)) pass("auth-secret", "AUTH_SECRET tem comprimento mínimo e não parece placeholder.");
  else fail("auth-secret", "AUTH_SECRET precisa ter ao menos 32 caracteres aleatórios e não pode ser placeholder.");

  const appUrl = clean(env.APP_URL);
  if (/^https:\/\//i.test(appUrl) && !/localhost|127\.0\.0\.1/i.test(appUrl)) pass("app-url", "APP_URL usa HTTPS público.");
  else fail("app-url", "APP_URL precisa ser uma URL HTTPS pública.");

  const emailProvider = clean(env.EMAIL_PROVIDER).toLowerCase();
  if (emailProvider === "resend") pass("email-provider", "E-mail transacional está em provider real.");
  else fail("email-provider", "EMAIL_PROVIDER precisa ser resend para recuperação de senha e convites comerciais.");

  if (!hasPlaceholder(env.RESEND_API_KEY)) pass("email-api-key", "Chave do provedor de e-mail está configurada.");
  else fail("email-api-key", "RESEND_API_KEY precisa estar configurada no ambiente comercial.");

  const emailFrom = clean(env.EMAIL_FROM);
  if (/^[^<>]*<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>$/.test(emailFrom) && !hasPlaceholder(emailFrom)) {
    pass("email-from", "Remetente transacional está configurado.");
  } else {
    fail("email-from", "EMAIL_FROM precisa usar um remetente real no formato Nome <email@dominio>.");
  }

  const s3 = evaluateS3(env);
  const storageProvider = clean(env.STORAGE_PROVIDER).toLowerCase();
  if (storageProvider === "s3" && s3.ok) {
    pass("raw-import-archive", "Arquivos brutos de laboratório usam object storage S3-compatible durável.");
  } else if (storageProvider === "s3") {
    fail("raw-import-archive", "STORAGE_PROVIDER=s3 exige endpoint HTTPS, bucket, região e credenciais S3 completas.");
  } else {
    fail("raw-import-archive", "STORAGE_PROVIDER precisa ser s3 no ambiente comercial para reter PDF/XLSX/CSV originais fora do filesystem efêmero.");
  }

  const reportProvider = clean(env.REPORT_STORAGE_PROVIDER || env.STORAGE_PROVIDER).toLowerCase();
  if (reportProvider === "inline") {
    pass("report-storage", "Snapshots publicados usam armazenamento inline durável no PostgreSQL.");
  } else if (reportProvider === "s3" && s3.ok) {
    pass("report-storage", "Snapshots publicados usam object storage S3-compatible durável.");
  } else if (reportProvider === "s3") {
    fail("report-storage", "REPORT_STORAGE_PROVIDER=s3 exige configuração S3 completa e HTTPS.");
  } else {
    fail("report-storage", "Use REPORT_STORAGE_PROVIDER=inline ou s3; armazenamento local não é durável em runtime serverless.");
  }

  const assistantMode = clean(env.RAIZ_ASSISTANT_MODE || "local").toLowerCase();
  if (assistantMode === "local") {
    pass("assistant-mode", "Assistente está local-first sem dependência generativa obrigatória.");
  } else if (assistantMode === "hybrid") {
    if (!hasPlaceholder(env.GEMINI_API_KEY)) pass("assistant-mode", "Modo híbrido tem chave generativa configurada.");
    else fail("assistant-mode", "RAIZ_ASSISTANT_MODE=hybrid exige GEMINI_API_KEY válida na arquitetura atual.");
  } else {
    fail("assistant-mode", "RAIZ_ASSISTANT_MODE deve ser local ou hybrid.");
  }

  if (!hasPlaceholder(env.COPERNICUS_CLIENT_ID) && !hasPlaceholder(env.COPERNICUS_CLIENT_SECRET)) {
    pass("copernicus", "Credenciais Copernicus estão configuradas.");
  } else {
    warn("copernicus", "NDVI real por satélite ficará indisponível até configurar as credenciais Copernicus.");
  }

  if (!hasPlaceholder(env.MERCADO_PAGO_ACCESS_TOKEN) && !hasPlaceholder(env.MERCADO_PAGO_WEBHOOK_SECRET)) {
    pass("billing", "Credenciais de cobrança estão configuradas.");
  } else {
    warn("billing", "Mercado Pago não está completo; cobrança automática deve permanecer desativada.");
  }

  return { ok: failures.length === 0, checks, failures, warnings };
}

export function printProductionReadiness(result, logger = console) {
  logger.log("\nRAIZ Digital · preflight de produção\n");
  for (const check of result.checks) logger.log(`[${check.level}] ${check.name}: ${check.message}`);
  logger.log(`\nResultado: ${result.ok ? "APROVADO" : "BLOQUEADO"} · ${result.failures.length} falha(s) · ${result.warnings.length} aviso(s).`);
  if (!result.ok) logger.log("Corrija as falhas antes de promover para main/produção.");
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const result = evaluateProductionReadiness(process.env);
  printProductionReadiness(result);
  if (!result.ok) process.exitCode = 1;
}
