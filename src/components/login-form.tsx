"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

export function LoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tenants, setTenants] = useState<Array<{ id: string; name: string; role: string }>>([]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password"), tenantId: form.get("tenantId") || undefined }),
    });
    const payload = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      if (payload.code === "TENANT_REQUIRED" && Array.isArray(payload.tenants)) setTenants(payload.tenants);
      setError(payload.error ?? "Não foi possível entrar.");
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label>
        <span>E-mail</span>
        <input name="email" type="email" autoComplete="email" required placeholder="voce@empresa.com.br" />
      </label>
      <label>
        <span>Senha</span>
        <input name="password" type="password" autoComplete="current-password" minLength={10} required placeholder="••••••••••" />
      </label>
      {tenants.length > 0 && <label>
        <span>Empresa</span>
        <select name="tenantId" required defaultValue=""><option value="" disabled>Selecione a empresa</option>{tenants.map((tenant)=><option key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.role}</option>)}</select>
      </label>}
      {error && <div className="login-error"><Icon name="warning" size={16}/><span>{error}</span></div>}
      <button className="button primary login-submit" disabled={loading}>
        {loading ? "Entrando…" : "Entrar na RAIZ"}<Icon name="arrow" size={16}/>
      </button>
      <small className="login-security"><Icon name="shield" size={13}/> Sessão segura em cookie HttpOnly. Seus dados operacionais permanecem isolados por empresa.</small>
    </form>
  );
}
