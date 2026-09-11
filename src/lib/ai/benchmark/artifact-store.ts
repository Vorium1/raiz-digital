import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Scorecard, ScenarioResult } from "@/lib/ai/benchmark/types";

/**
 * Fase 4F, item 9 — "Respostas reais do benchmark não podem ser sobrescritas". Achado real da Fase 4E: a
 * primeira execução real contra o Gemini (10/39 cenários com resposta real) foi perdida porque uma segunda
 * tentativa salvou por cima do MESMO nome de arquivo (`scripts/_tmp-benchmark-gemini.json`) -- um erro de
 * PROCESSO desta sessão (script de teste ad-hoc reusando um nome fixo), não do harness em si. Corrigido
 * estruturalmente: toda execução real agora grava um artefato em disco com nome ÚNICO (timestamp de alta
 * resolução + sufixo aleatório -- nunca reusa/sobrescreve), identificado por provider/modelo/versão do
 * prompt/versão do benchmark/timestamp -- exatamente os 5 campos pedidos. `provider:"replay"`
 * (`/api/dev/assistant-benchmark/route.ts`) pode carregar QUALQUER artefato salvo pelo nome -- nunca
 * depende implicitamente "do último resultado".
 *
 * Nunca grava segredo/chave -- só o `Scorecard`/`ScenarioResult[]` (que já não contêm `GEMINI_API_KEY` em
 * lugar nenhum; o provider nunca inclui a chave na resposta).
 */

export type RunArtifactMeta = {
  provider: string;
  model: string;
  isRealLanguageModel: boolean;
  promptVersion: string;
  benchmarkVersion: string;
  generatedAt: string;
  filename: string;
};

export type RunArtifact = RunArtifactMeta & {
  scorecard: Scorecard;
  results: ScenarioResult[];
};

function artifactsDir(): string {
  return path.join(process.cwd(), ".benchmark-runs");
}

function sanitize(part: string): string {
  return part.replace(/[^a-zA-Z0-9.-]+/g, "_");
}

export async function saveRunArtifact(input: { provider: string; model: string; isRealLanguageModel: boolean; promptVersion: string; benchmarkVersion: string; scorecard: Scorecard; results: ScenarioResult[] }): Promise<RunArtifactMeta> {
  const dir = artifactsDir();
  await mkdir(dir, { recursive: true });
  const generatedAt = new Date().toISOString();
  // Sufixo aleatório além do timestamp -- duas execuções no mesmo milissegundo (improvável, mas não
  // impossível) ainda nunca colidem/sobrescrevem uma a outra.
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const filename = `${sanitize(input.provider)}--${sanitize(input.model)}--${sanitize(input.benchmarkVersion)}--${sanitize(input.promptVersion)}--${sanitize(generatedAt)}--${randomSuffix}.json`;
  const artifact: RunArtifact = { ...input, generatedAt, filename };
  await writeFile(path.join(dir, filename), JSON.stringify(artifact, null, 2), "utf8");
  return { provider: input.provider, model: input.model, isRealLanguageModel: input.isRealLanguageModel, promptVersion: input.promptVersion, benchmarkVersion: input.benchmarkVersion, generatedAt, filename };
}

export async function listRunArtifacts(): Promise<RunArtifactMeta[]> {
  const dir = artifactsDir();
  let filenames: string[];
  try {
    filenames = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch {
    return []; // diretório ainda não existe -- nenhuma execução real salva ainda, não é um erro.
  }
  const metas: RunArtifactMeta[] = [];
  for (const filename of filenames) {
    try {
      const raw = JSON.parse(await readFile(path.join(dir, filename), "utf8")) as RunArtifact;
      metas.push({ provider: raw.provider, model: raw.model, isRealLanguageModel: raw.isRealLanguageModel, promptVersion: raw.promptVersion, benchmarkVersion: raw.benchmarkVersion, generatedAt: raw.generatedAt, filename: raw.filename });
    } catch {
      // arquivo corrompido/parcial -- ignora, nunca derruba a listagem inteira por causa de 1 artefato ruim.
    }
  }
  return metas.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

export async function loadRunArtifact(filename: string): Promise<RunArtifact | null> {
  // `filename` nunca vira um caminho -- só o nome de arquivo em si (sem `/`/`..`), pra nunca ler fora de
  // `.benchmark-runs/` mesmo se alguém mandar um valor malicioso pela rota.
  const safeName = path.basename(filename);
  try {
    const raw = await readFile(path.join(artifactsDir(), safeName), "utf8");
    return JSON.parse(raw) as RunArtifact;
  } catch {
    return null;
  }
}
