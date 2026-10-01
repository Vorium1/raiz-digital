export type ClientPersonType = "PF" | "PJ";

export function normalizeTaxDocument(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function hasValidCheckDigit(source: string, expected: string, weights: number[]) {
  const sum = [...source].reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
  const remainder = sum % 11;
  const computed = remainder < 2 ? 0 : 11 - remainder;
  return computed === Number(expected);
}

export function isValidCpf(document: string) {
  return /^\d{11}$/.test(document) && !/^(\d)\1{10}$/.test(document)
    && hasValidCheckDigit(document.slice(0, 9), document[9], [10, 9, 8, 7, 6, 5, 4, 3, 2])
    && hasValidCheckDigit(document.slice(0, 10), document[10], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
}

export function isValidCnpj(document: string) {
  return /^\d{14}$/.test(document) && !/^(\d)\1{13}$/.test(document)
    && hasValidCheckDigit(document.slice(0, 12), document[12], [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    && hasValidCheckDigit(document.slice(0, 13), document[13], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
}

export function validateClientDocument(personType: ClientPersonType, value: string | null | undefined) {
  const normalized = normalizeTaxDocument(value);
  if (!(value ?? "").trim()) return { normalized: null, error: null };
  const valid = personType === "PF" ? isValidCpf(normalized) : isValidCnpj(normalized);
  return { normalized, error: valid ? null : `Informe um ${personType === "PF" ? "CPF" : "CNPJ"} válido.` };
}

/** Formats known numeric documents without changing an unrecognized legacy value. */
export function formatClientDocument(value: string | null | undefined) {
  const digits = normalizeTaxDocument(value);
  if (digits.length === 11) return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  if (digits.length === 14) return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  return value || "Não informado";
}
