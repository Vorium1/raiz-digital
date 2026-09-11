/**
 * Fase 4F — tokenização compartilhada pra checagem de rastreabilidade (grounding) de texto livre contra
 * evidência real. Usado pelo gate de produção (`assistant-grounding-gate.ts`) E pelos critérios do
 * benchmark (`benchmark/criteria.ts`) -- uma única implementação, nunca duas cópias que podem divergir.
 */

const BENIGN_TOKENS = new Set(["—", "0", "100", "nao", "informado", "nenhum", "de"]);

/**
 * Tokeniza um texto (valor de fato composto, ou uma frase de `summary`) em pedaços "significativos"
 * (>=2 caracteres) pra checar rastreabilidade -- comparar a string INTEIRA como substring literal falha
 * pra qualquer texto formatado/composto a partir de mais de um campo da evidência (ex.: `score`+`level`
 * virarem "82/100 (ALTA)" juntos; nenhum campo isolado da evidência contém essa string exata, mas "82" e
 * "ALTA" -- os dados reais -- estão lá). "100" fica de fora por ser só a escala fixa ("X/100"), não um
 * dado citado. Também normaliza acento e o prefixo cosmético de versão ("v1" -> "1", convenção já usada em
 * toda a base) antes de dividir.
 */
export function significantTokens(value: string): string[] {
  return value
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\bv(\d)/gi, "$1")
    .split(/[^A-Za-z0-9.]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !BENIGN_TOKENS.has(t.toLowerCase()));
}

/** Normaliza um texto (acento + minúsculo) pro mesmo tratamento usado na comparação -- comparação
 *  case-insensitive de propósito: um provider generativo formata prosa ("Score: 82") enquanto a evidência
 *  serializada tem a chave JSON em outro caso ("score":82); o DADO é o mesmo. */
export function normalizeForGrounding(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Todo token significativo de `text` está presente em `haystack` (já normalizado)? */
export function allTokensGrounded(text: string, haystackNormalized: string): boolean {
  const tokens = significantTokens(text).map((t) => t.toLowerCase());
  if (!tokens.length) return true; // texto puramente benigno (ex.: só "—")
  return tokens.every((t) => haystackNormalized.includes(t));
}

/** Extrai só os tokens NUMÉRICOS significativos de um texto (pra checar "número inventado no resumo" sem
 *  reagir a cada palavra comum). */
export function numericTokens(text: string): string[] {
  return significantTokens(text).filter((t) => /^\d/.test(t) || /\d/.test(t));
}
