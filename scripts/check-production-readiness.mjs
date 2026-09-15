import { pathToFileURL } from "node:url";
import { evaluateProductionReadiness } from "../src/domain/production-readiness.ts";

export { evaluateProductionReadiness } from "../src/domain/production-readiness.ts";

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
