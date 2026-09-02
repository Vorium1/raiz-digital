export async function sendEmail(input: { to: string; subject: string; text: string }) {
  const provider = process.env.EMAIL_PROVIDER ?? "console";

  if (provider === "console") {
    console.log(`\n--- E-MAIL (EMAIL_PROVIDER=console, não enviado de verdade) ---\nPara: ${input.to}\nAssunto: ${input.subject}\n\n${input.text}\n----------------------------------------------------------------\n`);
    return { delivered: false, logged: true };
  }

  console.warn(`EMAIL_PROVIDER="${provider}" ainda não implementado; e-mail para ${input.to} não foi enviado.`);
  return { delivered: false, logged: false };
}
