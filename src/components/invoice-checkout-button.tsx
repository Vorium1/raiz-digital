"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";

type Props = {
  invoiceId: string;
  enabled: boolean;
};

export function InvoiceCheckoutButton({ invoiceId, enabled }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function openCheckout() {
    if (!enabled || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/billing/invoices/${invoiceId}/checkout`, { method: "POST" });
      const payload = await response.json().catch(() => ({})) as { checkoutUrl?: string; error?: string };
      if (!response.ok || !payload.checkoutUrl) {
        throw new Error(payload.error ?? "Não foi possível abrir o pagamento.");
      }

      const checkout = new URL(payload.checkoutUrl);
      if (checkout.protocol !== "https:" || !checkout.hostname.endsWith("mercadopago.com.br")) {
        throw new Error("O endereço de pagamento retornado não pertence ao Mercado Pago Brasil.");
      }
      window.location.assign(checkout.toString());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível abrir o pagamento.");
      setBusy(false);
    }
  }

  return <div style={{ display: "grid", gap: 6, justifyItems: "start" }}>
    <button
      type="button"
      className="button secondary"
      disabled={!enabled || busy}
      onClick={() => void openCheckout()}
    >
      <Icon name="wallet" size={14}/>
      {busy ? "Abrindo…" : enabled ? "Pagar no Mercado Pago" : "Pagamento indisponível"}
    </button>
    {error && <small style={{ color: "var(--danger)" }}>{error}</small>}
  </div>;
}
