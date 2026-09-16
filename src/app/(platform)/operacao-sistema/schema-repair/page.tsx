import Link from "next/link";
import { getPlatformSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function SchemaRepairPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getPlatformSession();
  if (!session) {
    return (
      <div className="content-wrap" style={{ paddingTop: 40 }}>
        <section className="card">
          <h1>Sessão necessária</h1>
          <p>Entre novamente para continuar.</p>
          <Link className="button primary" href="/login">Ir para login</Link>
        </section>
      </div>
    );
  }

  if (!session.isPlatformCurator) {
    return (
      <div className="content-wrap" style={{ paddingTop: 40 }}>
        <section className="card">
          <h1>Acesso restrito</h1>
          <p>Este reparo só pode ser executado pelo curador da plataforma.</p>
          <Link className="button" href="/dashboard">Voltar</Link>
        </section>
      </div>
    );
  }

  const params = await searchParams;
  return (
    <div className="content-wrap" style={{ paddingTop: 40, maxWidth: 860 }}>
      <section className="card">
        <span className="eyebrow">REPARO CONTROLADO DE BANCO</span>
        <h1>Sincronizar schema 035–037</h1>
        <p>
          O diagnóstico confirmou que o banco está atrás do código atual. Este reparo adiciona somente
          estruturas ausentes das migrations 035, 036 e 037, registra as migrations e valida o resultado
          dentro de uma única transação. Nenhum dado operacional é apagado.
        </p>
        {params.error ? (
          <div className="empty-state" style={{ margin: "18px 0" }}>
            <strong>Reparo não aplicado</strong>
            <small>Código técnico: {params.error}</small>
          </div>
        ) : null}
        <form action="/api/internal/schema-repair" method="post">
          <button className="button primary" type="submit">Aplicar reparo de schema 035–037</button>
        </form>
        <p style={{ marginTop: 16, opacity: 0.72 }}>
          Em caso de qualquer falha, a transação é revertida integralmente.
        </p>
      </section>
    </div>
  );
}
