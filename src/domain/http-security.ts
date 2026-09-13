export type HttpSecurityHeader = { key: string; value: string };

/**
 * Baseline de headers de defesa em profundidade que não interfere com Leaflet,
 * tiles externos, upload de laudos, geolocalização de campo ou redirecionamento
 * para Checkout Pro. CSP fica deliberadamente fora deste bloco até existir uma
 * matriz completa de origens externas para não quebrar funcionalidades reais.
 */
export function getHttpSecurityHeaders(): HttpSecurityHeader[] {
  return [
    { key: "Strict-Transport-Security", value: "max-age=31536000" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  ];
}
