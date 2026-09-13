"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/ui";
import type { ActiveUserSession } from "@/lib/auth/session-security";

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function sessionDeviceLabel(userAgent: string | null) {
  if (!userAgent) return "Dispositivo não identificado";
  const value = userAgent.toLowerCase();
  if (value.includes("android")) return "Android";
  if (value.includes("iphone") || value.includes("ipad") || value.includes("ios")) return "iPhone / iPad";
  if (value.includes("windows")) return "Windows";
  if (value.includes("macintosh") || value.includes("mac os")) return "Mac";
  if (value.includes("linux")) return "Linux";
  return "Navegador / dispositivo";
}

export function SessionSecurityCard({ sessions }: { sessions: ActiveUserSession[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const others = sessions.filter((session) => !session.current).length;

  async function revokeOthers() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/sessions/revoke-others", { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível encerrar as outras sessões.");
      const revoked = Number(payload.revoked ?? 0);
      setMessage(revoked > 0 ? `${revoked} sessão(ões) encerrada(s).` : "Nenhuma outra sessão ativa precisava ser encerrada.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao encerrar as outras sessões.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="data-card" style={{ marginTop: 18 }}>
      <div className="card-header">
        <div><span className="eyebrow">SEGURANÇA DA CONTA</span><h2>Sessões ativas</h2></div>
        <button className="secondary-button" type="button" disabled={busy || others === 0} onClick={() => void revokeOthers()}>
          <Icon name="shield" size={16}/>{busy ? "Encerrando..." : "Encerrar outras sessões"}
        </button>
      </div>

      <p className="report-empty-note" style={{ marginTop: 0 }}>
        Alterar sua senha também encerra automaticamente todas as outras sessões. A sessão atual é preservada.
      </p>

      {message && <div className="import-message success" style={{ marginBottom: 12 }}><Icon name="shield"/><div><strong>{message}</strong></div></div>}
      {error && <div className="import-message error" style={{ marginBottom: 12 }}><Icon name="warning"/><div><strong>{error}</strong></div></div>}

      <div className="report-table-wrap">
        <table className="data-table">
          <thead><tr><th>Dispositivo</th><th>Empresa</th><th>Iniciada</th><th>Expira</th><th>Situação</th></tr></thead>
          <tbody>{sessions.map((session) => (
            <tr key={session.id}>
              <td><strong>{sessionDeviceLabel(session.userAgent)}</strong><small>{session.current ? "Este navegador" : "Outra sessão da sua conta"}</small></td>
              <td>{session.tenantName ?? "Empresa não identificada"}</td>
              <td>{formatDateTime(session.createdAt)}</td>
              <td>{formatDateTime(session.expiresAt)}</td>
              <td><StatusBadge tone={session.current ? "success" : "waiting"}>{session.current ? "Atual" : "Ativa"}</StatusBadge></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
