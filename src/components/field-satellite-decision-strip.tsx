import Link from "next/link";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/ui";
import { computeFieldSatelliteStatus } from "@/domain/field-satellite-status";
import type { FieldOverview } from "@/lib/repositories/field-overview";

/**
 * Faixa executiva do satélite na primeira dobra do Talhão 360. É deliberadamente pequena: chama
 * atenção quando existe algo que merece investigação e leva para a camada completa, sem transformar
 * um índice de vegetação em diagnóstico ou recomendação.
 */
export function FieldSatelliteDecisionStrip({ fieldId, snapshots }: { fieldId: string; snapshots: FieldOverview["ndviSnapshots"] }) {
  const status = computeFieldSatelliteStatus(fieldId, snapshots);
  return (
    <div className="priority-list card" aria-label="Situação do satélite neste talhão">
      <Link href={status.href} className="priority-row">
        <StatusBadge tone={status.tone}>{status.badge}</StatusBadge>
        <div>
          <strong>{status.heading}</strong>
          <small>{status.detail}</small>
        </div>
        <Icon name="chevron" size={16}/>
      </Link>
    </div>
  );
}
