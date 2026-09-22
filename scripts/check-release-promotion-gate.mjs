import { pathToFileURL } from "node:url";
import { CRITICAL_RELEASE_ISSUES, evaluateReleasePromotionGate } from "../src/domain/release-promotion-gate.ts";

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

export async function fetchCriticalIssueStates({
  repository,
  token,
  fetchImpl = fetch,
} = {}) {
  const repo = clean(repository);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    return Object.fromEntries(CRITICAL_RELEASE_ISSUES.map((n) => [n, "unknown"]));
  }

  const states = {};
  for (const issueNumber of CRITICAL_RELEASE_ISSUES) {
    try {
      const headers = {
        Accept: "application/vnd.github+json",
        "User-Agent": "raiz-digital-release-gate",
        "X-GitHub-Api-Version": "2022-11-28",
      };
      if (clean(token)) headers.Authorization = `Bearer ${clean(token)}`;

      const response = await fetchImpl(`https://api.github.com/repos/${repo}/issues/${issueNumber}`, { headers });
      if (!response.ok) {
        states[issueNumber] = "unknown";
        continue;
      }
      const payload = await response.json();
      states[issueNumber] = payload?.state === "open" || payload?.state === "closed" ? payload.state : "unknown";
    } catch {
      states[issueNumber] = "unknown";
    }
  }
  return states;
}

export async function runReleasePromotionGate(env = process.env, logger = console) {
  const baseRef = clean(env.GITHUB_BASE_REF || env.RAIZ_PROMOTION_BASE_REF);
  const headRef = clean(env.GITHUB_HEAD_REF || env.RAIZ_PROMOTION_HEAD_REF);

  // Fora de PR para main o gate é deliberadamente neutro: não introduz rede nem
  // interfere em feature/develop/release CI.
  if (baseRef !== "main") {
    logger.log("release-promotion-gate: não aplicável (base != main)");
    return { applicable: false, allowed: true, blockers: [], criticalIssues: CRITICAL_RELEASE_ISSUES };
  }

  let issueStates;
  const override = clean(env.RAIZ_PROMOTION_ISSUE_STATES_JSON);
  if (override) {
    try {
      issueStates = JSON.parse(override);
    } catch {
      issueStates = Object.fromEntries(CRITICAL_RELEASE_ISSUES.map((n) => [n, "unknown"]));
    }
  } else {
    issueStates = await fetchCriticalIssueStates({
      repository: env.GITHUB_REPOSITORY,
      token: env.GITHUB_TOKEN,
    });
  }

  const result = evaluateReleasePromotionGate({ baseRef, headRef, issueStates });
  for (const issueNumber of CRITICAL_RELEASE_ISSUES) {
    logger.log(`release-promotion-gate: #${issueNumber}=${issueStates[issueNumber] ?? "unknown"}`);
  }

  if (!result.allowed) {
    for (const blocker of result.blockers) logger.error(`release-promotion-gate: BLOCKED ${blocker}`);
    logger.error("release-promotion-gate: promoção para main bloqueada; fechar os gates críticos antes do GO.");
  } else {
    logger.log("release-promotion-gate: blockers críticos fechados; este check não substitui branch protection nem GO explícito.");
  }
  return result;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const result = await runReleasePromotionGate();
  if (!result.allowed) process.exitCode = 1;
}
