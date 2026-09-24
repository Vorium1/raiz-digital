"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { CommercialPlanPublishSelect } from "@/components/commercial-plan-publish-select";

export function PublishReportButton({ interpretationId, analysisId, initialCommercialPlanSnapshotId = "" }: { interpretationId: string; analysisId: string; initialCommercialPlanSnapshotId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [commercialPlanSnapshotId, setCommercialPlanSnapshotId] = useState(initialCommercialPlanSnapshotId);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function publish() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/interpretations/${interpretationId}/publish-report`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commercialPlanSnapshotId: commercialPlanSnapshotId || null }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Falha ao gerar a versão oficial RAIZ.");
      setMessage({ tone: "success", text: "Laudo RAIZ oficial gerado com versão imutável e trilha de auditoria." });
      router.refresh();
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Falha ao publicar a decisão oficial." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print" style={{ display: "grid", gap: 9, alignItems: "start" }}>
      <CommercialPlanPublishSelect
        analysisId={analysisId}
        value={commercialPlanSnapshotId}
        onChange={setCommercialPlanSnapshotId}
        disabled={busy}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="button secondary" disabled={busy} onClick={() => void publish()}>
          <Icon name="upload" size={15}/>{busy ? "Gerando…" : "Gerar versão oficial RAIZ"}
        </button>
        {message && <span style={{ fontSize: 11, color: message.tone === "success" ? "#287d5f" : "#b3473e" }}>{message.text}</span>}
      </div>
    </div>
  );
}
