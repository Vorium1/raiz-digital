import fs from "node:fs";
import { fileURLToPath } from "node:url";

const SHA_RE = /^[0-9a-f]{40}$/i;

export function selectAuthorizedCandidatePr(prs, input) {
  const candidateSha = String(input?.candidateSha ?? "").trim().toLowerCase();
  const repository = String(input?.repository ?? "").trim();
  const baseRef = String(input?.baseRef ?? "develop").trim();

  if (!SHA_RE.test(candidateSha)) throw new Error("candidate_sha inválido.");
  if (!repository || !repository.includes("/")) throw new Error("Repositório candidato inválido.");
  if (!baseRef) throw new Error("Base autorizada inválida.");

  const matches = Array.isArray(prs)
    ? prs.filter((pr) => (
        pr?.state === "open"
        && pr?.base?.ref === baseRef
        && String(pr?.head?.sha ?? "").toLowerCase() === candidateSha
        && pr?.head?.repo?.full_name === repository
      ))
    : [];

  if (matches.length !== 1) {
    throw new Error("SHA rejeitado: ele deve ser exatamente o head atual de um único PR aberto, do mesmo repositório, com a base autorizada.");
  }

  const number = Number(matches[0]?.number);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error("PR autorizado sem identificador válido.");
  }

  return { number, sha: candidateSha };
}

function runCli() {
  const responseFile = process.env.RESPONSE_FILE?.trim();
  const candidateSha = process.env.CANDIDATE_SHA?.trim();
  const repository = process.env.REPOSITORY?.trim();
  const baseRef = process.env.BASE_REF?.trim() || "develop";

  if (!responseFile || !candidateSha || !repository) {
    throw new Error("Contexto obrigatório da validação de candidate SHA está incompleto.");
  }

  const prs = JSON.parse(fs.readFileSync(responseFile, "utf8"));
  const authorized = selectAuthorizedCandidatePr(prs, { candidateSha, repository, baseRef });
  process.stdout.write(String(authorized.number));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    runCli();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Candidate SHA rejeitado.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 2;
  }
}
