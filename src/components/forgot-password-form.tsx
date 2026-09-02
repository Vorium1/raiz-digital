"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";

export function ForgotPasswordForm() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email") }),
      });
      if (!response.ok) throw new Error("Não foi possível processar o pedido.");
      setSent(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível processar o pedido.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="login-error" style={{ background: "#eaf7f1", color: "#23775c" }}>
        <Icon name="check" size={16} />
        <span>Se esse e-mail estiver cadastrado, enviamos as instruções para redefinir a senha. Volte para o <Link href="/login">login</Link> quando terminar.</span>
      </div>
    );
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label>
        <span>E-mail cadastrado</span>
        <input name="email" type="email" autoComplete="email" required placeholder="voce@empresa.com.br" />
      </label>
      {error && <div className="login-error"><Icon name="warning" size={16} /><span>{error}</span></div>}
      <button className="button primary login-submit" disabled={loading}>
        {loading ? "Enviando…" : "Enviar instruções"}<Icon name="arrow" size={16} />
      </button>
      <small className="login-security"><Icon name="shield" size={13} /> Voltar para o <Link href="/login">login</Link>.</small>
    </form>
  );
}
