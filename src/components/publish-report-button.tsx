"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";

export function PublishReportButton({ interpretationId }: { interpretationId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function publish() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/interpretations/${interpretationId}/publish-report`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Falha ao publicar.");
      setMessage({ tone: "success", text: "Relatório publicado e registrado na trilha de auditoria." });
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao publicar." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button type="button" className="button secondary" disabled={busy} onClick={() => void publish()}>
        <Icon name="upload" size={15}/>{busy ? "Publicando…" : "Publicar relatório"}
      </button>
      {message && <span style={{ fontSize: 11, color: message.tone === "success" ? "#287d5f" : "#b3473e" }}>{message.text}</span>}
    </div>
  );
}
