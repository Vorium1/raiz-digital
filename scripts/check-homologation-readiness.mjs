import { pathToFileURL } from "node:url";
import { evaluateProductionReadiness } from "./check-production-readiness.mjs";
import { getOperationalIntegrationReadiness } from "../src/domain/operational-readiness.ts";

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(value));
}

function remotePostgres(value) {
  try {
    const parsed = new URL(clean(value));
    if (!/^postgres(?:ql)?:$/.test(parsed.protocol)) return false;
    if (!parsed.hostname || ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) return false;
    return Boolean(parsed.username);
  } catch {
    return false;
  }
}

const MANUAL_GATES = Object.freeze([
  "entrega real de convite por e-mail",
  "entrega real do fluxo de recuperação de senha",
  "smoke test multi-dispositivo de sessões e 2FA",
  "persistência e abertura visual do arquivo bruto/original importado",
  "confirmação do bucket privado, criptografia e política de retenção/lifecycle",
  "homologação funcional do Copernicus/Sentinel-2 com chamada real",
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

function automatedCheck(name, status, message) {
  return { name, status, message };
}

export function evaluateHomologationReadiness(env = process.env) {
  const production = evaluateProductionReadiness(env);
  const integrations = getOperationalIntegrationReadiness(env);
  const checks = [];

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
    "copernicus-config",
    integrations.copernicus ? "PASS" : "BLOCKED",
    integrations.copernicus
      ? "Credenciais Copernicus estão presentes; chamada real ainda precisa ser homologada."
      : "Credenciais Copernicus estão incompletas.",
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
    manualGates: [...MANUAL_GATES],
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

export function printHomologationReadiness(result, logger = console) {
  logger.log("\nRAIZ Digital · preflight automático de homologação\n");
  for (const check of result.checks) logger.log(`[${check.status}] ${check.name}: ${check.message}`);
  logger.log(`\nAutomação: ${result.automatedOk ? "SEM BLOQUEIO DE CONFIGURAÇÃO" : "BLOQUEADA"} · ${result.blocked.length} bloqueio(s).`);
  logger.log(`Homologação total: PENDENTE · ${result.manualGates.length} gate(s) externo(s)/humano(s) permanecem.`);
  logger.log("Este comando nunca emite GO de produção.");
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const result = evaluateHomologationReadiness(process.env);
  printHomologationReadiness(result);
  if (!result.automatedOk) process.exitCode = 1;
}
