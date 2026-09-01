export async function POST(request: Request) {
  const signature = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id");
  const rawBody = await request.text();

  if (!signature || !requestId) {
    return Response.json({ error: "Webhook sem assinatura obrigatória" }, { status: 401 });
  }

  // O adaptador do Mercado Pago validará a assinatura, persistirá o evento bruto
  // de forma idempotente e consultará o status oficial antes de alterar o acesso.
  return Response.json({ received: true, requestId, bytes: rawBody.length }, { status: 202 });
}
