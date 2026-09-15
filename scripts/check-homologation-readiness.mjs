import { pathToFileURL } from "node:url";
import { evaluateHomologationReadiness } from "../src/domain/homologation-readiness.ts";

export {
  evaluateHomologationReadiness,
  getHomologationReadinessHttpResult,
  sanitizeHomologationReadinessForApi,
} from "../src/domain/homologation-readiness.ts";

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
