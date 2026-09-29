"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function PrintButton({ label = "Exportar PDF" }: { label?: string }) {
  const [preparing, setPreparing] = useState(false);

  async function handlePrint() {
    if (preparing) return;
    setPreparing(true);
    const deadline = Date.now() + 6000;
    while (document.querySelector('[data-report-ndvi-state="loading"]') && Date.now() < deadline) {
      await wait(150);
    }
    setPreparing(false);
    window.print();
  }

  return (
    <button type="button" className="button primary no-print" onClick={() => void handlePrint()} disabled={preparing}>
      <Icon name="file" size={16}/>{preparing ? "Preparando PDF…" : label}
    </button>
  );
}
