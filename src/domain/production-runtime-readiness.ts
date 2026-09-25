import { evaluateProductionReadiness, type ProductionReadinessResult } from "./production-readiness.ts";

export type ProductionRuntimeReadinessPayload =
  | { status: "ready" }
  | { status: "not_ready" };

export type ProductionRuntimeReadiness = {
  httpStatus: 200 | 503;
  payload: ProductionRuntimeReadinessPayload;
  evaluation: ProductionReadinessResult;
};

export function getProductionRuntimeReadiness(
  env: NodeJS.ProcessEnv = process.env,
): ProductionRuntimeReadiness {
  const evaluation = evaluateProductionReadiness(env);
  return evaluation.ok
    ? { httpStatus: 200, payload: { status: "ready" }, evaluation }
    : { httpStatus: 503, payload: { status: "not_ready" }, evaluation };
}
