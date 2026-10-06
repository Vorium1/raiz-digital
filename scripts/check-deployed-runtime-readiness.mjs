import { pathToFileURL } from "node:url";

export const DEFAULT_MAX_ATTEMPTS = 30;
export const DEFAULT_WAIT_MS = 20_000;

function required(value, name) {
  const clean = String(value ?? "").trim();
  if (!clean) throw new Error(`${name} is required`);
  return clean;
}

export function normalizeProductionEnvironment(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function isProductionDeployment(deployment, sha) {
  return Boolean(
    deployment
    && String(deployment.sha ?? "") === sha
    && normalizeProductionEnvironment(deployment.environment) === "production"
  );
}

export function readinessUrlFromDeploymentStatus(status) {
  const raw = String(status?.environment_url ?? "").trim();
  if (!raw) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  parsed.pathname = "/api/health/readiness";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

export function deploymentTerminalFailure(statuses) {
  const state = String(statuses?.[0]?.state ?? "").toLowerCase();
  return ["failure", "error", "inactive"].includes(state);
}

async function githubJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "raiz-production-readiness-check",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} while checking deployment readiness`);
  }
  return response.json();
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForProductionDeployment({
  repository,
  sha,
  token,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  waitMs = DEFAULT_WAIT_MS,
  githubApiUrl = "https://api.github.com",
}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const deploymentsUrl = new URL(
      `/repos/${repository}/deployments`,
      githubApiUrl,
    );
    deploymentsUrl.searchParams.set("sha", sha);
    deploymentsUrl.searchParams.set("environment", "Production");
    deploymentsUrl.searchParams.set("per_page", "20");

    const deployments = await githubJson(deploymentsUrl, token);
    const deployment = Array.isArray(deployments)
      ? deployments.find((item) => isProductionDeployment(item, sha))
      : null;

    if (deployment) {
      const statuses = await githubJson(
        `${githubApiUrl}/repos/${repository}/deployments/${deployment.id}/statuses?per_page=20`,
        token,
      );
      if (Array.isArray(statuses) && deploymentTerminalFailure(statuses)) {
        throw new Error("Production deployment reached a terminal failure state.");
      }
      const success = Array.isArray(statuses)
        ? statuses.find((item) => String(item.state).toLowerCase() === "success")
        : null;
      const readinessUrl = readinessUrlFromDeploymentStatus(success);
      if (success && readinessUrl) return { deployment, status: success, readinessUrl };
    }

    if (attempt < maxAttempts) await sleep(waitMs);
  }
  throw new Error(
    `No successful Production deployment for SHA ${sha} became available within the bounded wait window.`,
  );
}

export async function assertRuntimeReadiness(readinessUrl) {
  const response = await fetch(readinessUrl, {
    method: "GET",
    cache: "no-store",
    redirect: "error",
    headers: { Accept: "application/json" },
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Runtime readiness endpoint returned non-JSON HTTP ${response.status}.`);
  }

  if (response.status !== 200 || payload?.status !== "ready") {
    throw new Error(`Runtime readiness check failed with HTTP ${response.status}.`);
  }
}

export async function run() {
  const token = required(process.env.GITHUB_TOKEN, "GITHUB_TOKEN");
  const repository = required(process.env.GITHUB_REPOSITORY, "GITHUB_REPOSITORY");
  const sha = required(process.env.GITHUB_SHA, "GITHUB_SHA");

  const resolved = await waitForProductionDeployment({ repository, sha, token });
  await assertRuntimeReadiness(resolved.readinessUrl);
  console.log("Production runtime readiness: ready for the deployed SHA.");
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : "Production runtime readiness check failed.");
    process.exitCode = 1;
  });
}
