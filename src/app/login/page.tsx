import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { LoginForm } from "@/components/login-form";
import { getPlatformSession } from "@/lib/auth/session";
import { isDatabaseMode } from "@/lib/data-mode";

export const metadata = { title: "Entrar" };

export default async function LoginPage() {
  if (!isDatabaseMode()) redirect("/dashboard");
  const session = await getPlatformSession();
  if (session) redirect("/dashboard");

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <BrandLogo variant="dark" priority />
        <div>
          <span className="eyebrow light">INTELIGÊNCIA AGRONÔMICA</span>
          <h1>Do solo à decisão,<br/>com precisão.</h1>
          <p>Uma base técnica única para clientes, talhões, análises, mapas, regras e revisão profissional.</p>
        </div>
        <small>RAIZ Digital · by Vorium</small>
      </section>
      <section className="login-card-wrap">
        <div className="login-card">
          <span className="eyebrow">ACESSO PROFISSIONAL</span>
          <h2>Entre na sua operação.</h2>
          <p>Use as credenciais cadastradas pela sua empresa. O tenant é resolvido no servidor e aplicado ao banco antes de qualquer consulta operacional.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
