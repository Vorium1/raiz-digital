"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

export function SimplePublishResultButton({
  analysisId,
  interpretationId: _interpretationId,
}: {
  analysisId: string;
  interpretationId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function publish() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/analyses/${analysisId}/official-result`, {
        method: "POST",
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
    <div className="simple-publish-result">
      <button type="button" disabled={busy} onClick={() => void publish()}>
        <Icon name="upload" size={15}/>
        {busy ? "Gerando laudo…" : "Gerar laudo RAIZ"}
      </button>
      {message && <small role="alert">{message}</small>}
    </div>
  );
}
