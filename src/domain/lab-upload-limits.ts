export const LAB_UPLOAD_LIMITS = {
  /** CSV/TXT em bytes UTF-8. */
  textBytes: 3_500_000,
  /** XLS/XLSX em bytes binários antes da conversão para base64. */
  spreadsheetBytes: 4_500_000,
  /** PDF/JPG/PNG/WEBP em bytes binários antes da conversão para base64. */
  imageOrPdfBytes: 8_500_000,
  /**
   * O JSON de /extract carrega o arquivo binário em base64 (≈4/3 do tamanho original),
   * portanto o teto HTTP precisa ser maior do que o teto exibido na interface.
   */
  extractRequestBytes: 12_000_000,
  /**
   * /validate e /commit precisam comportar 4,5 MB binários como ~6 MB de base64,
   * mais JSON e o recibo de proveniência assinado transportado entre as etapas.
   */
  tabularRequestBytes: 6_500_000,
} as const;

export function base64TransportBytes(rawBytes: number) {
  if (!Number.isSafeInteger(rawBytes) || rawBytes < 0) return Number.POSITIVE_INFINITY;
  return Math.ceil(rawBytes / 3) * 4;
}
