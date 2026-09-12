export type EmailDeliveryResult = {
  delivered: boolean;
  logged: boolean;
  provider: "console" | "resend";
  messageId?: string;
};

/**
 * Adaptador mínimo de e-mail da RAIZ. Em desenvolvimento, `console` continua útil e não exige serviço
 * externo. Em ambientes comerciais use `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` e `EMAIL_FROM`.
 * Nenhuma chave é armazenada no repositório.
 */
export async function sendEmail(input: { to: string; subject: string; text: string }): Promise<EmailDeliveryResult> {
  const provider = (process.env.EMAIL_PROVIDER ?? "console").trim().toLowerCase();

  if (provider === "console") {
    console.log(`\n--- E-MAIL (EMAIL_PROVIDER=console, não enviado de verdade) ---\nPara: ${input.to}\nAssunto: ${input.subject}\n\n${input.text}\n----------------------------------------------------------------\n`);
    return { delivered: false, logged: true, provider: "console" };
  }

  if (provider !== "resend") {
    throw new Error(`EMAIL_PROVIDER não suportado: ${provider}. Use "console" ou "resend".`);
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    throw new Error("Entrega de e-mail não configurada: defina RESEND_API_KEY e EMAIL_FROM.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
    }),
  });

  const payload = await response.json().catch(() => ({})) as { id?: string; message?: string; name?: string };
  if (!response.ok || !payload.id) {
    const detail = payload.message ?? payload.name ?? `HTTP ${response.status}`;
    throw new Error(`Falha no provedor de e-mail: ${detail}`);
  }

  return { delivered: true, logged: false, provider: "resend", messageId: payload.id };
}
