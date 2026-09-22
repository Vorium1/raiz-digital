export const MANAGEMENT_SYSTEM_OPTIONS = [
  { value: "CONVENTIONAL", label: "Preparo convencional" },
  { value: "NO_TILL_ESTABLISHMENT", label: "Implantação do plantio direto" },
  { value: "NO_TILL_CONSOLIDATED_NO_10_20_RESTRICTIONS", label: "Plantio direto consolidado · sem restrição em 10–20 cm" },
  { value: "NO_TILL_CONSOLIDATED_WITH_10_20_RESTRICTIONS", label: "Plantio direto consolidado · com restrição em 10–20 cm" },
  { value: "OTHER", label: "Outro sistema / ainda não classificado" },
] as const;

export type CanonicalManagementSystem = (typeof MANAGEMENT_SYSTEM_OPTIONS)[number]["value"];

function normalizedText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Normaliza apenas descrições inequívocas. "Plantio direto" sozinho NÃO informa
 * se é implantação ou sistema consolidado, nem a condição 10–20 cm, portanto
 * permanece OTHER em vez de inventar um estágio de manejo.
 */
export function normalizeManagementSystem(value: string | null | undefined): CanonicalManagementSystem {
  const text = normalizedText(value);
  if (!text) return "OTHER";
  if (MANAGEMENT_SYSTEM_OPTIONS.some((option) => option.value === text)) {
    return text as CanonicalManagementSystem;
  }
  if (new Set(["CONVENCIONAL", "PREPARO_CONVENCIONAL", "SISTEMA_CONVENCIONAL"]).has(text)) return "CONVENTIONAL";
  if (new Set(["IMPLANTACAO_PLANTIO_DIRETO", "IMPLANTACAO_DO_PLANTIO_DIRETO", "PLANTIO_DIRETO_IMPLANTACAO", "SPD_IMPLANTACAO"]).has(text)) {
    return "NO_TILL_ESTABLISHMENT";
  }
  if (
    text.includes("CONSOLID") &&
    (text.includes("SEM_RESTRICAO") || text.includes("SEM_RESTRICOES")) &&
    (text.includes("10_20") || text.includes("10_A_20"))
  ) {
    return "NO_TILL_CONSOLIDATED_NO_10_20_RESTRICTIONS";
  }
  if (
    text.includes("CONSOLID") &&
    (text.includes("COM_RESTRICAO") || text.includes("COM_RESTRICOES")) &&
    (text.includes("10_20") || text.includes("10_A_20"))
  ) {
    return "NO_TILL_CONSOLIDATED_WITH_10_20_RESTRICTIONS";
  }
  return "OTHER";
}

export function managementSystemLabel(value: string | null | undefined) {
  const canonical = normalizeManagementSystem(value);
  return MANAGEMENT_SYSTEM_OPTIONS.find((option) => option.value === canonical)?.label ?? "Outro sistema / ainda não classificado";
}
