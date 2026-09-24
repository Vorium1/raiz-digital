"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { CommercialPlanPublishSelect } from "@/components/commercial-plan-publish-select";

export function SimplePublishResultButton({
  analysisId,
  interpretationId: _interpretationId,
  label = "Gerar laudo RAIZ",
  busyLabel = "Gerando laudo…",
}: {
  analysisId: string;
  interpretationId?: string;
  label?: string;
  busyLabel?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [commercialPlanSnapshotId, setCommercialPlanSnapshotId] = useState("");
  const [message, setMessage] = useState("");

  async function publish() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/analyses/${analysisId}/official-result`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commercialPlanSnapshotId: commercialPlanSnapshotId || null }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível gerar o laudo RAIZ.");
      router.push(`/resultado/${analysisId}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível gerar o laudo RAIZ.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="simple-publish-result" style={{ display: "grid", gap: 8 }}>
      <CommercialPlanPublishSelect
        analysisId={analysisId}
        value={commercialPlanSnapshotId}
        onChange={setCommercialPlanSnapshotId}
        disabled={busy}
      />
      <button type="button" disabled={busy} onClick={() => void publish()}>
        <Icon name="upload" size={15}/>
        {busy ? busyLabel : label}
      </button>
      {message && <small role="alert">{message}</small>}
    </div>
  );
}
