export type ProductionReadinessLevel = "PASS" | "FAIL" | "WARN";

export type ProductionReadinessCheck = {
  level: ProductionReadinessLevel;
  name: string;
  message: string;
};

export type ProductionReadinessResult = {
  ok: boolean;
  checks: ProductionReadinessCheck[];
  failures: ProductionReadinessCheck[];
  warnings: ProductionReadinessCheck[];
};

type EnvLike = Record<string, string | undefined>;

function clean(value: string | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function hasPlaceholder(value: string | undefined) {
  const normalized = clean(value).toLowerCase();
  return !normalized || ["troque", "changeme", "example", "seudominio", "localhost", "raiz:raiz"].some((marker) => normalized.includes(marker));
}

function parseDatabaseUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (!/^postgres(?:ql)?:$/.test(parsed.protocol)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseHttpsUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return null;
    if (["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function evaluateProductionReadiness(env: EnvLike = process.env): ProductionReadinessResult {
  const checks: ProductionReadinessCheck[] = [];
  const failures: ProductionReadinessCheck[] = [];
  const warnings: ProductionReadinessCheck[] = [];

  function pass(name: string, message: string) {
    checks.push({ level: "PASS", name, message });
  }
  function fail(name: string, message: string) {
    const check: ProductionReadinessCheck = { level: "FAIL", name, message };
    checks.push(check);
    failures.push(check);
  }
  function warn(name: string, message: string) {
    const check: ProductionReadinessCheck = { level: "WARN", name, message };
    checks.push(check);
    warnings.push(check);
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

  const reportProvider = clean(env.REPORT_STORAGE_PROVIDER || env.STORAGE_PROVIDER).toLowerCase();
  if (reportProvider === "inline") pass("report-storage", "Snapshots publicados usam armazenamento durável suportado pela versão atual.");
  else fail("report-storage", "Defina REPORT_STORAGE_PROVIDER=inline; o snapshot oficial precisa permanecer independente do filesystem efêmero e do arquivo bruto.");

  const rawProvider = clean(env.STORAGE_PROVIDER).toLowerCase();
  const s3Endpoint = parseHttpsUrl(clean(env.S3_ENDPOINT));
  const s3Region = clean(env.S3_REGION);
  const s3Bucket = clean(env.S3_BUCKET);
  const s3AccessKey = clean(env.S3_ACCESS_KEY);
  const s3SecretKey = clean(env.S3_SECRET_KEY);
  if (rawProvider !== "s3") {
    fail("raw-import-archive", "STORAGE_PROVIDER precisa ser s3 no ambiente comercial para preservar o arquivo original do laboratório.");
  } else if (!s3Endpoint) {
    fail("raw-import-archive", "S3_ENDPOINT precisa ser uma URL HTTPS remota válida.");
  } else if ([s3Region, s3Bucket, s3AccessKey, s3SecretKey].some(hasPlaceholder)) {
    fail("raw-import-archive", "S3_REGION, S3_BUCKET, S3_ACCESS_KEY e S3_SECRET_KEY precisam estar configurados sem placeholders.");
  } else {
    pass("raw-import-archive", "Arquivo bruto/original tem object storage S3 compatível configurado.");
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

  pass(
    "satellite-ndvi",
    "Provider público Earth Search + Sentinel-2 L2A/COG não exige credenciais privadas no runtime.",
  );

  const billingConfigured = !hasPlaceholder(env.MERCADO_PAGO_ACCESS_TOKEN)
    && !hasPlaceholder(env.MERCADO_PAGO_WEBHOOK_SECRET);
  const checkoutEnabled = clean(env.MERCADO_PAGO_CHECKOUT_ENABLED).toLowerCase() === "true";

  if (billingConfigured) {
    pass("billing", "Credenciais de cobrança estão configuradas.");
  } else {
    warn("billing", "Mercado Pago não está completo; cobrança deve permanecer desativada.");
  }

  if (checkoutEnabled && !billingConfigured) {
    fail("billing-checkout", "MERCADO_PAGO_CHECKOUT_ENABLED=true exige Access Token e segredo do webhook completos; ativação inconsistente foi bloqueada.");
  } else if (checkoutEnabled) {
    pass("billing-checkout", "Checkout comercial foi explicitamente habilitado com credenciais completas.");
  } else {
    pass("billing-checkout", "Checkout comercial permanece explicitamente desligado; credenciais podem ser homologadas sem expor cobrança aos usuários.");
  }

  return { ok: failures.length === 0, checks, failures, warnings };
}
