export function isMercadoPagoBrazilCheckoutUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "mercadopago.com.br" || url.hostname.endsWith(".mercadopago.com.br"));
  } catch {
    return false;
  }
}

export type MercadoPagoCheckoutActivation = {
  credentialsConfigured: boolean;
  explicitlyEnabled: boolean;
  available: boolean;
};

type EnvLike = Record<string, string | undefined>;

/**
 * Credenciais e ativação comercial são gates separados de propósito.
 * Configurar token/segredo para homologar webhook não deve ligar cobrança para usuários finais.
 */
export function getMercadoPagoCheckoutActivation(env: EnvLike): MercadoPagoCheckoutActivation {
  const credentialsConfigured = Boolean(
    env.MERCADO_PAGO_ACCESS_TOKEN?.trim() && env.MERCADO_PAGO_WEBHOOK_SECRET?.trim(),
  );
  const explicitlyEnabled = env.MERCADO_PAGO_CHECKOUT_ENABLED?.trim().toLowerCase() === "true";
  return {
    credentialsConfigured,
    explicitlyEnabled,
    available: credentialsConfigured && explicitlyEnabled,
  };
}
