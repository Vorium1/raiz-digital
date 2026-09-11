import type { AssistantEvidenceResult } from "@/lib/ai/assistant-evidence";

/**
 * Fase 4, Bloco 5 — rótulo contextual real (o que aparece no cabeçalho do painel do Assistente: "Talhão
 * 04 · Fazenda Cabeda", "Análise AN-2026-014", "Central de Decisão"...). SEMPRE derivado do Evidence
 * Package já resolvido e validado (Bloco 2) -- nunca do que o client afirma que a tela é. Quando a
 * evidência não resolveu (`found: false`) ou o contexto era inválido, devolve `null` -- o painel mostra
 * "Contexto indisponível" nesse caso, nunca inventa um rótulo.
 *
 * Deliberadamente puro (só `import type`) -- testável com `node --experimental-strip-types`.
 */
export function deriveContextLabel(evidence: AssistantEvidenceResult): string | null {
  if (!evidence.found) return null;
  switch (evidence.kind) {
    case "dashboard":
      return "Central de Decisão";
    case "field":
      return `${evidence.evidence.field.name} · ${evidence.evidence.field.propertyName}`;
    case "property":
    case "report-property":
      return evidence.evidence.property.name;
    case "analysis":
      return `Análise ${evidence.evidence.analysis.code}`;
    case "report-field":
      return `Relatório · ${evidence.evidence.analysis.fieldName}`;
    case "comparison":
      return evidence.evidence.ready ? `Comparativo · ${evidence.evidence.labelA} × ${evidence.evidence.labelB}` : "Comparativos";
    case "intelligence":
      return "Inteligência Agronômica";
    case "map":
      return evidence.evidence.delegatedTo === "field" ? `Mapa · ${evidence.evidence.field.field.name}` : "Mapa";
  }
}
