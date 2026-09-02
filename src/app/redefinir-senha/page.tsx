import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { getPlatformSession } from "@/lib/auth/session";
import { isDatabaseMode } from "@/lib/data-mode";

export const metadata = { title: "Redefinir senha" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  if (!isDatabaseMode()) redirect("/dashboard");
  const session = await getPlatformSession();
  if (session) redirect("/dashboard");
  const { token } = await searchParams;

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <img src="/brand/logo-dark.svg" alt="RAIZ Digital · Inteligência Agronômica" />
        <div>
          <span className="eyebrow light">INTELIGÊNCIA AGRONÔMICA</span>
          <h1>Do solo à decisão,<br/>com precisão.</h1>
          <p>Uma base técnica única para clientes, talhões, análises, mapas, regras e revisão profissional.</p>
        </div>
        <small>RAIZ Digital · by Vorium</small>
      </section>
      <section className="login-card-wrap">
        <div className="login-card">
          <span className="eyebrow">RECUPERAÇÃO DE ACESSO</span>
          <h2>Defina uma nova senha.</h2>
          <p>Essa senha substitui a anterior imediatamente e todas as sessões atuais são encerradas por segurança.</p>
          <ResetPasswordForm token={token ?? ""} />
        </div>
      </section>
    </main>
  );
}
