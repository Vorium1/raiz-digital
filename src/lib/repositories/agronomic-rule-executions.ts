import { buildRuleTrace, evaluateAgronomicRuleAutomation } from "@/domain/agronomic-rule-catalog";
import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";

export class AgronomicRuleExecutionError extends Error {
  constructor(message: string, readonly status = 422) {
    super(message);
    this.name = "AgronomicRuleExecutionError";
  }
}

function serializeJson(value: unknown, label: string): string {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error("undefined");
    return serialized;
  } catch {
    throw new AgronomicRuleExecutionError(`${label} não é serializável em JSON.`, 400);
  }
}

/**
 * Grava uma execução imutável. O status e a fonte NÃO vêm do chamador: são resolvidos
 * novamente pelo catálogo versionado para impedir que um cliente marque uma regra de
 * revisão/insuficiente como READY no ledger.
 */
export async function recordAgronomicRuleExecution(input: {
  tenantId: string;
  userId: string;
  ruleId: string;
  analysisId?: string | null;
  cropSeasonId?: string | null;
  inputPayload: unknown;
  outputPayload: unknown;
}) {
  const decision = evaluateAgronomicRuleAutomation(input.ruleId);
  if (!decision.rule) throw new AgronomicRuleExecutionError(`Regra agronômica desconhecida: ${input.ruleId}`, 400);
  const serializedInput = serializeJson(input.inputPayload, "Input da execução");
  const serializedOutput = serializeJson(input.outputPayload, "Output da execução");
  const trace = buildRuleTrace(input.ruleId);
  const serializedTrace = serializeJson(trace, "Rastreabilidade da regra");

  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query<{
      id: string;
      ruleId: string;
      ruleVersion: string;
      sourceSnapshotId: string;
      executionStatus: string;
      createdAt: string;
    }>(
      `INSERT INTO agronomic_rule_executions
       (tenant_id, analysis_id, crop_season_id, rule_id, rule_version, source_snapshot_id,
        execution_status, source_trace, input_payload, output_payload, created_by)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::uuid)
       RETURNING id::text,
                 rule_id AS "ruleId",
                 rule_version AS "ruleVersion",
                 source_snapshot_id AS "sourceSnapshotId",
                 execution_status AS "executionStatus",
                 created_at::text AS "createdAt"`,
      [
        input.tenantId,
        input.analysisId ?? null,
        input.cropSeasonId ?? null,
        trace.ruleId,
        trace.ruleVersion,
        trace.sourceSnapshotId,
        trace.executionStatus,
        serializedTrace,
        serializedInput,
        serializedOutput,
        input.userId,
      ],
    );
    const execution = result.rows[0];
    if (!execution) throw new AgronomicRuleExecutionError("Não foi possível registrar a execução da regra.", 500);

    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "AGRONOMIC_RULE_EXECUTED",
      entityType: "agronomic_rule_execution",
      entityId: execution.id,
      metadata: {
        ruleId: trace.ruleId,
        ruleVersion: trace.ruleVersion,
        sourceSnapshotId: trace.sourceSnapshotId,
        executionStatus: trace.executionStatus,
        analysisId: input.analysisId ?? null,
        cropSeasonId: input.cropSeasonId ?? null,
        automationAllowed: decision.allowed,
      },
    });

    return { ...execution, automationAllowed: decision.allowed, sourceTrace: trace };
  });
}
