export type SourceVerificationCompleteness = {
  verified: boolean;
  blockers: Array<"NO_IMPORT" | "RAW_SOURCE_MISSING" | "HUMAN_CONFIRMATION_MISSING">;
};

/**
 * A análise só é "fonte confirmada" quando TODOS os imports vinculados têm arquivo bruto identificado
 * e confirmação humana que corresponde exatamente ao import atual. Não existe maioria, fallback ou
 * inferência histórica para proveniência.
 */
export function evaluateSourceVerificationCompleteness(input: {
  importCount: number;
  archivedCount: number;
  verifiedCount: number;
}): SourceVerificationCompleteness {
  const blockers: SourceVerificationCompleteness["blockers"] = [];
  if (input.importCount <= 0) blockers.push("NO_IMPORT");
  if (input.archivedCount < input.importCount) blockers.push("RAW_SOURCE_MISSING");
  if (input.verifiedCount < input.importCount) blockers.push("HUMAN_CONFIRMATION_MISSING");
  return { verified: input.importCount > 0 && blockers.length === 0, blockers };
}
