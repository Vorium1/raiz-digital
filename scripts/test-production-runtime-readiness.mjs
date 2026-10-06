import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_MAX_ATTEMPTS,
  isProductionDeployment,
  readinessUrlFromDeploymentStatus,
  deploymentTerminalFailure,
} from "./check-deployed-runtime-readiness.mjs";

assert.equal(DEFAULT_MAX_ATTEMPTS, 30, "polling precisa ser limitado");
assert.equal(
  isProductionDeployment({ sha: "abc", environment: "Production" }, "abc"),
  true,
);
assert.equal(
  isProductionDeployment({ sha: "abc", environment: "Preview" }, "abc"),
  false,
);
assert.equal(
  isProductionDeployment({ sha: "other", environment: "Production" }, "abc"),
  false,
);

assert.equal(
  readinessUrlFromDeploymentStatus({ environment_url: "https://raiz-example.vercel.app/path?x=1" }),
  "https://raiz-example.vercel.app/api/health/readiness",
);
assert.equal(readinessUrlFromDeploymentStatus({ environment_url: "http://unsafe.test" }), null);
assert.equal(readinessUrlFromDeploymentStatus({}), null);

assert.equal(deploymentTerminalFailure([{ state: "failure" }]), true);
assert.equal(deploymentTerminalFailure([{ state: "error" }]), true);
assert.equal(deploymentTerminalFailure([{ state: "pending" }]), false);

const route = readFileSync("src/app/api/health/readiness/route.ts", "utf8");
assert.match(route, /evaluateProductionReadiness\(process\.env\)/);
assert.match(route, /status: readiness\.ok \? "ready" : "not_ready"/);
assert.match(route, /status: readiness\.ok \? 200 : 503/);
assert.doesNotMatch(route, /failures|warnings|checks/, "endpoint público não pode expor detalhes do preflight");

const workflow = readFileSync(".github/workflows/production-runtime-readiness.yml", "utf8");
assert.match(workflow, /branches:\s*\n\s*- main/);
assert.match(workflow, /deployments: read/);
assert.match(workflow, /github\.sha/);
assert.match(workflow, /timeout-minutes: 15/);
assert.match(workflow, /check-deployed-runtime-readiness\.mjs/);

console.log("production runtime readiness proof: ok");
