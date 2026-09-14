import type { CommercialNutrient } from "@/domain/commercial-input-engine";
import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";
import {
  CommercialSimulationError,
  simulateCommercialPlan,
  type CommercialSimulationMode,
} from "@/lib/repositories/commercial-simulation";

export class CommercialPlanSnapshotError extends Error {
  constructor(message: string, readonly status = 422, readonly details?: unknown) {
    super(message);
    this.name = "CommercialPlanSnapshotError";
  }
}

export type SaveCommercialPlanSnapshotInput = {
  tenantId: string;
  userId: string;
  analysisId: string;
  label?: string | null;
  mode: CommercialSimulationMode;
  productId?: string | null;
  productAId?: string | null;
  productBId?: string | null;
  driverNutrient?: CommercialNutrient | null;
};

function normalizeLabel(value: string | null | undefined) {
  if (value == null) return null;
  const label = value.trim();
  if (!label) return null;
  if (label.length > 160) throw new CommercialPlanSnapshotError("Nome do cenário deve ter no máximo 160 caracteres.", 400);
  return label;
}

function engineInputFromRequest(input: SaveCommercialPlanSnapshotInput) {
  if (input.mode === "SINGLE") {
    return {
      mode: input.mode,
      productId: input.productId ?? null,
      driverNutrient: input.driverNutrient ?? null,
    };
  }
  if (input.mode === "PK_PAIR") {
    return {
      mode: input.mode,
      productAId: input.productAId ?? null,
      productBId: input.productBId ?? null,
    };
  }
  return { mode: input.mode, productId: input.productId ?? null };
}

export async function listCommercialPlanSnapshots(input: {
  tenantId: string;
  userId: string;
  analysisId: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(50, Math.trunc(input.limit ?? 20)));
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query<{
      id: string;
      label: string | null;
      simulationMode: CommercialSimulationMode;
      schemaVersion: number;
      areaHa: number;
      sourceTargets: unknown;
      productSnapshots: unknown;
      engineInput: unknown;
      engineOutput: unknown;
      createdBy: string;
      createdByName: string | null;
      createdAt: string;
    }>(
      `SELECT cps.id::text,
              cps.label,
              cps.simulation_mode AS "simulationMode",
              cps.schema_version AS "schemaVersion",
              cps.area_ha::float8 AS "areaHa",
              cps.source_targets AS "sourceTargets",
              cps.product_snapshots AS "productSnapshots",
              cps.engine_input AS "engineInput",
              cps.engine_output AS "engineOutput",
              cps.created_by::text AS "createdBy",
              u.name AS "createdByName",
              cps.created_at::text AS "createdAt"
       FROM commercial_plan_snapshots cps
       LEFT JOIN users u ON u.id = cps.created_by
       WHERE cps.tenant_id = $1::uuid AND cps.analysis_id = $2::uuid
       ORDER BY cps.created_at DESC, cps.id DESC
       LIMIT $3`,
      [input.tenantId, input.analysisId, limit],
    );
    return result.rows;
  });
}

/**
 * Salva somente após recalcular no servidor. O cliente envia escolhas, nunca output.
 * O resultado persistido congela exatamente os alvos e produtos usados por `simulateCommercialPlan`.
 */
export async function saveCommercialPlanSnapshot(input: SaveCommercialPlanSnapshotInput) {
  const label = normalizeLabel(input.label);

  let simulation: Awaited<ReturnType<typeof simulateCommercialPlan>>;
  try {
    simulation = await simulateCommercialPlan(input);
  } catch (error) {
    if (error instanceof CommercialSimulationError) {
      throw new CommercialPlanSnapshotError(error.message, error.status, error.details);
    }
    throw error;
  }

  const engineInput = engineInputFromRequest(input);
  const sourceTargets = simulation.sourceTargets;
  // `simulateCommercialPlan` só retorna sucesso depois de validar um produto ativo; por tipo,
  // SINGLE/LIME congelam exatamente 1 produto e PK_PAIR congela exatamente 2 produtos.
  const productSnapshots = simulation.selectedProducts;

  if (sourceTargets.length === 0) {
    throw new CommercialPlanSnapshotError("A simulação não possui alvo oficial rastreável para congelar no histórico.", 422);
  }

  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    // Confirma no mesmo write transaction que a análise/safra do cálculo ainda pertencem ao tenant.
    const linkage = await client.query(
      `SELECT 1
       FROM analyses a
       WHERE a.tenant_id = $1::uuid
         AND a.id = $2::uuid
         AND a.crop_season_id = $3::uuid
       FOR SHARE`,
      [input.tenantId, simulation.analysisId, simulation.cropSeasonId],
    );
    if (!linkage.rows[0]) {
      throw new CommercialPlanSnapshotError("A análise mudou de safra durante o salvamento. Recalcule o cenário.", 409);
    }

    const result = await client.query<{
      id: string;
      label: string | null;
      simulationMode: CommercialSimulationMode;
      schemaVersion: number;
      areaHa: number;
      sourceTargets: unknown;
      productSnapshots: unknown;
      engineInput: unknown;
      engineOutput: unknown;
      createdAt: string;
    }>(
      `INSERT INTO commercial_plan_snapshots
       (tenant_id, analysis_id, crop_season_id, label, simulation_mode, schema_version, area_ha,
        source_targets, product_snapshots, engine_input, engine_output, created_by)
       VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,1,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::uuid)
       RETURNING id::text,
                 label,
                 simulation_mode AS "simulationMode",
                 schema_version AS "schemaVersion",
                 area_ha::float8 AS "areaHa",
                 source_targets AS "sourceTargets",
                 product_snapshots AS "productSnapshots",
                 engine_input AS "engineInput",
                 engine_output AS "engineOutput",
                 created_at::text AS "createdAt"`,
      [
        input.tenantId,
        simulation.analysisId,
        simulation.cropSeasonId,
        label,
        simulation.mode,
        simulation.areaHa,
        JSON.stringify(sourceTargets),
        JSON.stringify(productSnapshots),
        JSON.stringify(engineInput),
        JSON.stringify(simulation.result),
        input.userId,
      ],
    );
    const snapshot = result.rows[0];
    if (!snapshot) throw new CommercialPlanSnapshotError("Não foi possível salvar o cenário comercial.", 500);

    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "COMMERCIAL_PLAN_SNAPSHOT_SAVED",
      entityType: "commercial_plan_snapshot",
      entityId: snapshot.id,
      metadata: {
        analysisId: simulation.analysisId,
        cropSeasonId: simulation.cropSeasonId,
        mode: simulation.mode,
        label,
        areaHa: simulation.areaHa,
        sourceRecommendationIds: sourceTargets.map((target) => target.recommendationId).filter(Boolean),
        productIds: productSnapshots.map((product) => product.id),
      },
    });

    return snapshot;
  });
}
