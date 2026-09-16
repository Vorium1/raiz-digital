export const LAB_UPLOAD_LIMITS = {
  /**
   * O deploy atual roda em Vercel Functions, cujo payload de request/response tem teto de 4,5 MB.
   * Mantemos folga para JSON, recibo HMAC e metadados em vez de prometer um tamanho que a borda rejeita.
   */
  functionPayloadBytes: 4_200_000,
  /** CSV/TXT em bytes UTF-8 antes do envelope/JSON. */
  textBytes: 3_000_000,
  /** XLS/XLSX em bytes binários antes da conversão para base64. */
  spreadsheetBytes: 3_000_000,
  /** PDF/JPG/PNG/WEBP em bytes binários antes da conversão para base64. */
  imageOrPdfBytes: 3_000_000,
  /** Preview público: o parser trabalha com tudo, mas a resposta HTTP não devolve milhares de linhas. */
  previewRows: 50,
  previewIssues: 100,
} as const;

export function base64TransportBytes(rawBytes: number) {
  if (!Number.isSafeInteger(rawBytes) || rawBytes < 0) return Number.POSITIVE_INFINITY;
  return Math.ceil(rawBytes / 3) * 4;
}

export function jsonTransportBytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function compactLabImportPreview<T extends { rows: unknown[]; issues: unknown[] }>(preview: T) {
  return {
    ...preview,
    normalizedRowCount: preview.rows.length,
    issueCount: preview.issues.length,
    rows: preview.rows.slice(0, LAB_UPLOAD_LIMITS.previewRows),
    issues: preview.issues.slice(0, LAB_UPLOAD_LIMITS.previewIssues),
  };
}
