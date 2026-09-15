/**
 * Fase 4F — padrões de texto compartilhados entre o grounding gate de produção
 * (`assistant-grounding-gate.ts`) e os critérios do harness de benchmark (`benchmark/criteria.ts`). Uma
 * única fonte de verdade -- nenhum dos dois lugares mantém uma cópia divergente da regra.
 */

export const SPATIAL_COINCIDENCE_PATTERNS: RegExp[] = [
  /coincide (espacialmente|com a (zona|área|região))/i,
  /est(á|a) exatamente na mesma (zona|área|região|posição)/i,
  /a região de menor vigor coincide/i,
  /confirma(da)? (a )?coincidência espacial/i,
];

export const CAUSALITY_PATTERNS: RegExp[] = [/(causou|provoca|é a causa d[eo])/i];

export const URL_PATTERN = /(https?:\/\/|www\.)\S+/i;
export const MARKDOWN_LINK_PATTERN = /\[[^\]]+\]\([^)]+\)/;

/** Fase 4F, item 6 — linguagem de recomendação/prescrição fora do escopo do Assistente RAIZ (regra
 *  inegociável do `CLAUDE.md`: "IA não decide agronomia" / "nenhuma recomendação oficial é publicada sem
 *  revisão profissional"). Um resumo que já soa como prescrição precisa ser rejeitado pelo gate, nunca só
 *  "sugerido". */
export const PRESCRIPTION_PATTERNS: RegExp[] = [
  /\b(recomendo|prescrevo|sugiro aplicar|deve aplicar|precisa aplicar)\b/i,
  /\b(aumente|reduza|diminua) a dose\b/i,
  /\baplique \d/i,
];

export const UUID_TOKEN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
