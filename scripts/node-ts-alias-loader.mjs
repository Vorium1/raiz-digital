import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) return nextResolve(specifier, context);

  const relative = specifier.slice(2);
  const base = path.resolve(process.cwd(), "src", relative);
  const candidates = path.extname(base)
    ? [base]
    : [`${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, "index.ts"), path.join(base, "index.tsx")];

  const match = candidates.find((candidate) => existsSync(candidate));
  if (!match) throw new Error(`Não foi possível resolver alias ${specifier} a partir de ${base}.`);
  return { url: pathToFileURL(match).href, shortCircuit: true };
}
