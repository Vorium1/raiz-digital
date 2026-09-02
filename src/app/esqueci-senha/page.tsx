import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { getPlatformSession } from "@/lib/auth/session";
import { isDatabaseMode } from "@/lib/data-mode";

export const metadata = { title: "Esqueci minha senha" };

export default async function ForgotPasswordPage() {
  if (!isDatabaseMode()) redirect("/dashboard");
  const session = await getPlatformSession();
  if (session) redirect("/dashboard");

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
          <h2>Esqueceu sua senha?</h2>
          <p>Informe o e-mail cadastrado. Se ele existir na base, enviamos um link para você definir uma nova senha.</p>
          <ForgotPasswordForm />
        </div>
      </section>
    </main>
  );
}
