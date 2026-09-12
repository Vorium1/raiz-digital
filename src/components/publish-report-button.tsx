"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

export function PublishReportButton({ interpretationId }: { interpretationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function publish() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/interpretations/${interpretationId}/publish-report`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Falha ao publicar a decisão oficial.");
      setMessage({ tone: "success", text: "Decisão oficial publicada com versão imutável e trilha de auditoria." });
      router.refresh();
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao publicar a decisão oficial." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button type="button" className="button secondary" disabled={busy} onClick={() => void publish()}>
        <Icon name="upload" size={15}/>{busy ? "Publicando…" : "Publicar decisão oficial"}
      </button>
      {message && <span style={{ fontSize: 11, color: message.tone === "success" ? "#287d5f" : "#b3473e" }}>{message.text}</span>}
    </div>
  );
}
