"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForPrintableAssets() {
  const deadline = Date.now() + 6000;
  while (
    document.querySelector('[data-report-ndvi-state="loading"], .concept-report .real-field-map-deferred')
    && Date.now() < deadline
  ) {
    await wait(150);
  }

  if ("fonts" in document) {
    await Promise.race([document.fonts.ready, wait(2500)]);
  }

  const pendingImages = Array.from(document.images).filter((image) => !image.complete);
  if (pendingImages.length) {
    await Promise.race([
      Promise.all(pendingImages.map((image) => new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      }))),
      wait(2500),
    ]);
  }

  await wait(120);
}

export function PrintButton({ label = "Exportar PDF" }: { label?: string }) {
  const [preparing, setPreparing] = useState(false);

  async function handlePrint() {
    if (preparing) return;
    setPreparing(true);
    await waitForPrintableAssets();
    setPreparing(false);
    window.print();
  }

  return (
    <button type="button" className="button primary no-print" onClick={() => void handlePrint()} disabled={preparing}>
      <Icon name="file" size={16}/>{preparing ? "Preparando PDF…" : label}
    </button>
  );
}
