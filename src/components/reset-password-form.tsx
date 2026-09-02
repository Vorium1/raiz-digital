"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");
    if (newPassword.length < 10) { setError("A nova senha precisa ter ao menos 10 caracteres."); return; }
    if (newPassword !== confirmPassword) { setError("A confirmação não bate com a nova senha."); return; }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível redefinir a senha.");
      setSuccess(true);
      setTimeout(() => router.replace("/login"), 2500);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível redefinir a senha.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return <div className="login-error"><Icon name="warning" size={16} /><span>Link inválido. Peça uma nova redefinição em <a href="/esqueci-senha">Esqueci minha senha</a>.</span></div>;
  }

  if (success) {
    return (
      <div className="login-error" style={{ background: "#eaf7f1", color: "#23775c" }}>
        <Icon name="check" size={16} />
        <span>Senha redefinida com sucesso. Levando você para o login…</span>
      </div>
    );
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label>
        <span>Nova senha</span>
        <input name="newPassword" type="password" autoComplete="new-password" minLength={10} required placeholder="mín. 10 caracteres" />
      </label>
      <label>
        <span>Confirmar nova senha</span>
        <input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required placeholder="repita a nova senha" />
      </label>
      {error && <div className="login-error"><Icon name="warning" size={16} /><span>{error}</span></div>}
      <button className="button primary login-submit" disabled={loading}>
        {loading ? "Salvando…" : "Redefinir senha"}<Icon name="arrow" size={16} />
      </button>
      <small className="login-security"><Icon name="shield" size={13} /> O link vale por 30 minutos e só pode ser usado uma vez.</small>
    </form>
  );
}
