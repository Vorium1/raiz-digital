"use client";

import { Icon } from "@/components/icon";

export function PrintButton({ label = "Exportar PDF" }: { label?: string }) {
  return (
    <button type="button" className="button primary no-print" onClick={() => window.print()}>
      <Icon name="file" size={16}/>{label}
    </button>
  );
}
