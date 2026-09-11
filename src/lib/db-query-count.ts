import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Fase 4E, Bloco 1 — contador de round-trips ao banco, escopado por requisição via `AsyncLocalStorage`.
 * Existe só pra medir de verdade (nunca "no olho") quanto cada caminho custa em número de consultas —
 * usado por `/api/assistant` e `/api/assistant/context` (atrás de um header de depuração, nunca exposto
 * por padrão) pra comparar o caminho pesado (Evidence Package completo) contra o caminho leve do
 * cabeçalho contextual (Fase 4E). Zero custo quando ninguém está contando (`getStore()` devolve
 * `undefined`, `incrementQueryCount` vira um no-op).
 */

const storage = new AsyncLocalStorage<{ count: number; texts: string[] }>();

export function incrementQueryCount(text?: string) {
  const store = storage.getStore();
  if (store) {
    store.count++;
    if (text) store.texts.push(text.replace(/\s+/g, " ").trim().slice(0, 80));
  }
}

export async function withQueryCounting<T>(fn: () => Promise<T>): Promise<{ result: T; queryCount: number; queryTexts: string[] }> {
  const store = { count: 0, texts: [] as string[] };
  const result = await storage.run(store, fn);
  return { result, queryCount: store.count, queryTexts: store.texts };
}
