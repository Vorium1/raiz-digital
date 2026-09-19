import { evaluateProductionReadiness, type ProductionReadinessResult } from "./production-readiness.ts";
import { getOperationalIntegrationReadiness, getSatelliteNdviReadiness, type OperationalIntegrationReadiness } from "./operational-readiness.ts";

export type HomologationCheckStatus = "PASS" | "BLOCKED" | "READY_TO_EXECUTE";

export type HomologationCheck = {
  name: string;
  status: HomologationCheckStatus;
  message: string;
};

type EnvLike = Record<string, string | undefined>;

type PlatformCuratorSessionLike = {
  isPlatformCurator: boolean;
} | null;

export type HomologationReadinessResult = {
  automatedOk: boolean;
  releaseReady: false;
  checks: HomologationCheck[];
  blocked: HomologationCheck[];
  readyToExecute: HomologationCheck[];
  manualGates: string[];
  productionSummary: {
    ok: boolean;
    failureCount: number;
    warningCount: number;
    failures: ProductionReadinessResult["failures"];
    warnings: ProductionReadinessResult["warnings"];
  };
  integrationSummary: OperationalIntegrationReadiness;
  note: string;
};

export type HomologationReadinessApiBody =
  | { status: "unauthorized"; releaseReady: false }
  | { status: "forbidden"; releaseReady: false }
  | { status: "unavailable"; releaseReady: false }
  | {
      status: "READY_FOR_EXTERNAL_HOMOLOGATION" | "BLOCKED";
      automatedOk: boolean;
      releaseReady: false;
      checks: HomologationCheck[];
      summary: {
        blockedCount: number;
        readyToExecuteCount: number;
        manualGateCount: number;
        productionFailureCount: number;
        productionWarningCount: number;
      };
      integrations: OperationalIntegrationReadiness;
      manualGates: string[];
      note: string;
    };

export type HomologationReadinessHttpResult = {
  httpStatus: 200 | 401 | 403 | 503;
  body: HomologationReadinessApiBody;
};

function clean(value: string | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function validUuid(value: string | undefined) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(value));
}

function remotePostgres(value: string | undefined) {
  try {
    const parsed = new URL(clean(value));
    if (!/^postgres(?:ql)?:$/.test(parsed.protocol)) return false;
    if (!parsed.hostname || ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) return false;
    return Boolean(parsed.username);
  } catch {
    return false;
  }
}

export const HOMOLOGATION_MANUAL_GATES = Object.freeze([
  "entrega real de convite por e-mail",
  "entrega real do fluxo de recuperação de senha",
  "smoke test multi-dispositivo de sessões e 2FA",
  "persistência e abertura visual do arquivo bruto/original importado",
  "confirmação do bucket privado, criptografia e política de retenção/lifecycle",
  "homologação funcional do Earth Search/Sentinel-2 com chamada real e custódia do raster",
  "auditoria Cabeda Área 01 com readyForReliableSpatialEvidence=true",
  "validação de gps_source/audit trail e dos demais gates independentes de VRA",
  "homologação Mercado Pago: assinatura, reentrega idempotente e cenários negativos",
  "Checkout Pro somente no ambiente autorizado de teste",
  "backup/PITR confirmado e restauração testada em ambiente separado",
  "aceitação funcional e agronômica final",
  "termos/LGPD aplicáveis ao piloto definidos ou revisados",
  "branch protection/ruleset de main e develop verificado no GitHub",
  "GO explícito do responsável pelo produto para develop -> main",
]);

function automatedCheck(name: string, status: HomologationCheckStatus, message: string): HomologationCheck {
  return { name, status, message };
}

export function evaluateHomologationReadiness(env: EnvLike = process.env): HomologationReadinessResult {
  const production = evaluateProductionReadiness(env);
  const integrations = getOperationalIntegrationReadiness(env);
  const satelliteNdvi = getSatelliteNdviReadiness(env);
  const checks: HomologationCheck[] = [];

  checks.push(automatedCheck(
    "production-config",
    production.ok ? "PASS" : "BLOCKED",
    production.ok
      ? "Configuração base passou no preflight de produção."
      : `Preflight de produção tem ${production.failures.length} falha(s).`,
  ));

  checks.push(automatedCheck(
    "email-config",
    integrations.email ? "PASS" : "BLOCKED",
    integrations.email
      ? "Configuração de e-mail transacional está presente; entrega real continua sendo gate externo."
      : "Configuração de e-mail transacional está incompleta.",
  ));

  checks.push(automatedCheck(
    "raw-storage-config",
    integrations.rawStorage ? "PASS" : "BLOCKED",
    integrations.rawStorage
      ? "Object storage bruto está configurado; privacidade/criptografia/lifecycle ainda exigem verificação no provider."
      : "Object storage bruto S3 compatível está incompleto.",
  ));

  checks.push(automatedCheck(
    "report-storage-config",
    integrations.reportStorage ? "PASS" : "BLOCKED",
    integrations.reportStorage
      ? "Armazenamento de snapshot oficial usa provider suportado."
      : "Armazenamento do snapshot oficial não está no provider esperado.",
  ));

  checks.push(automatedCheck(
    "satellite-ndvi-provider",
    integrations.satelliteNdvi ? "PASS" : "BLOCKED",
    integrations.satelliteNdvi
      ? satelliteNdvi.provider === "earth-search"
        ? "NDVI usa Earth Search público + Sentinel-2 L2A/COG sem credenciais privadas; a chamada real e a custódia do raster continuam sob homologação."
        : "Provider alternativo Copernicus foi selecionado explicitamente com credenciais completas; chamada real e custódia continuam sob homologação."
      : satelliteNdvi.provider === "copernicus"
        ? "Copernicus foi selecionado explicitamente, mas suas credenciais estão incompletas."
        : `NDVI_SATELLITE_PROVIDER="${satelliteNdvi.provider}" não é suportado.`,
  ));

  checks.push(automatedCheck(
    "mercado-pago-config",
    integrations.mercadoPago ? "PASS" : "BLOCKED",
    integrations.mercadoPago
      ? "Credenciais Mercado Pago estão presentes; webhook/checkout real continuam sob homologação externa."
      : "Credenciais Mercado Pago estão incompletas para a homologação financeira prevista no piloto.",
  ));

  const cabedaDatabaseReady = remotePostgres(env.HOMOLOGATION_DATABASE_URL);
  const cabedaTenantReady = validUuid(env.CABEDA_TENANT_ID);
  checks.push(automatedCheck(
    "cabeda-audit-context",
    cabedaDatabaseReady && cabedaTenantReady ? "READY_TO_EXECUTE" : "BLOCKED",
    cabedaDatabaseReady && cabedaTenantReady
      ? "Contexto mínimo da auditoria Cabeda está válido; isso apenas autoriza executar a prova read-only."
      : "HOMOLOGATION_DATABASE_URL remota válida e CABEDA_TENANT_ID UUID são obrigatórios para executar a auditoria Cabeda.",
  ));

  const blocked = checks.filter((item) => item.status === "BLOCKED");
  const readyToExecute = checks.filter((item) => item.status === "READY_TO_EXECUTE");

  return {
    automatedOk: blocked.length === 0,
    releaseReady: false,
    checks,
    blocked,
    readyToExecute,
    manualGates: [...HOMOLOGATION_MANUAL_GATES],
    productionSummary: {
      ok: production.ok,
      failureCount: production.failures.length,
      warningCount: production.warnings.length,
      failures: production.failures,
      warnings: production.warnings,
    },
    integrationSummary: integrations,
    note: "Este preflight automatiza somente evidências comprováveis por configuração/código. Nunca substitui homologação externa, revisão agronômica, LGPD, branch protection ou GO humano.",
  };
}

export function sanitizeHomologationReadinessForApi(result: HomologationReadinessResult): HomologationReadinessApiBody {
  return {
    status: result.automatedOk ? "READY_FOR_EXTERNAL_HOMOLOGATION" : "BLOCKED",
    automatedOk: result.automatedOk,
    releaseReady: false,
    checks: result.checks.map(({ name, status, message }) => ({ name, status, message })),
    summary: {
      blockedCount: result.blocked.length,
      readyToExecuteCount: result.readyToExecute.length,
      manualGateCount: result.manualGates.length,
      productionFailureCount: result.productionSummary.failureCount,
      productionWarningCount: result.productionSummary.warningCount,
    },
    integrations: { ...result.integrationSummary },
    manualGates: [...result.manualGates],
    note: result.note,
  };
}

export function getHomologationReadinessHttpResult(
  session: PlatformCuratorSessionLike,
  env: EnvLike = process.env,
  evaluator: (environment: EnvLike) => HomologationReadinessResult = evaluateHomologationReadiness,
): HomologationReadinessHttpResult {
  if (!session) {
    return { httpStatus: 401, body: { status: "unauthorized", releaseReady: false } };
  }

  if (!session.isPlatformCurator) {
    return { httpStatus: 403, body: { status: "forbidden", releaseReady: false } };
  }

  try {
    const result = evaluator(env);
    return {
      httpStatus: 200,
      body: sanitizeHomologationReadinessForApi(result),
    };
  } catch {
    return { httpStatus: 503, body: { status: "unavailable", releaseReady: false } };
  }
}
