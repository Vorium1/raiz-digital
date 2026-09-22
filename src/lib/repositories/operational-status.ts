import { query, withTenant } from "@/lib/db";

export type OperationalStatusSnapshot = {
  database: { ok: boolean; latencyMs: number | null };
  security: { failedLogins15m: number | null };
  payments: {
    events24h: number | null;
    errors24h: number | null;
    stuckEvents: number | null;
  };
  tenant: {
    auditEvents24h: number | null;
    pendingInvoices: number | null;
    overdueInvoices: number | null;
  };
};

type GlobalOperationalRow = {
  failed_logins_15m: number;
  payment_events_24h: number;
  payment_errors_24h: number;
  payment_stuck: number;
};

type TenantOperationalRow = {
  audit_events_24h: number;
  pending_invoices: number;
  overdue_invoices: number;
};

export async function getOperationalStatusSnapshot(context: { tenantId: string; userId: string }): Promise<OperationalStatusSnapshot> {
  const startedAt = Date.now();
  let databaseOk = false;
  let latencyMs: number | null = null;
  let security: OperationalStatusSnapshot["security"] = { failedLogins15m: null };
  let payments: OperationalStatusSnapshot["payments"] = { events24h: null, errors24h: null, stuckEvents: null };
  let tenant: OperationalStatusSnapshot["tenant"] = { auditEvents24h: null, pendingInvoices: null, overdueInvoices: null };

  try {
    const globalResult = await query<GlobalOperationalRow>(
      `SELECT
         (SELECT count(*)::int FROM login_attempts WHERE created_at > now() - interval '15 minutes') AS failed_logins_15m,
         (SELECT count(*)::int FROM payment_events WHERE received_at > now() - interval '24 hours') AS payment_events_24h,
         (SELECT count(*)::int FROM payment_events WHERE received_at > now() - interval '24 hours' AND processing_error IS NOT NULL) AS payment_errors_24h,
         (SELECT count(*)::int FROM payment_events WHERE processed_at IS NULL AND received_at < now() - interval '5 minutes') AS payment_stuck`,
    );
    databaseOk = true;
    latencyMs = Date.now() - startedAt;
    const row = globalResult.rows[0];
    if (row) {
      security = { failedLogins15m: row.failed_logins_15m };
      payments = {
        events24h: row.payment_events_24h,
        errors24h: row.payment_errors_24h,
        stuckEvents: row.payment_stuck,
      };
    }
  } catch (error) {
    console.error("operational_status_global_query_failed", error);
  }

  if (databaseOk) {
    try {
      tenant = await withTenant(context, async (client) => {
        const result = await client.query<TenantOperationalRow>(
          `SELECT
             (SELECT count(*)::int FROM audit_events WHERE tenant_id = $1::uuid AND created_at > now() - interval '24 hours') AS audit_events_24h,
             (SELECT count(*)::int FROM invoices WHERE tenant_id = $1::uuid AND status = 'PENDING') AS pending_invoices,
             (SELECT count(*)::int FROM invoices WHERE tenant_id = $1::uuid AND status = 'PENDING' AND due_at < current_date) AS overdue_invoices`,
          [context.tenantId],
        );
        const row = result.rows[0];
        return row
          ? {
              auditEvents24h: row.audit_events_24h,
              pendingInvoices: row.pending_invoices,
              overdueInvoices: row.overdue_invoices,
            }
          : { auditEvents24h: 0, pendingInvoices: 0, overdueInvoices: 0 };
      });
    } catch (error) {
      console.error("operational_status_tenant_query_failed", error);
    }
  }

  return {
    database: { ok: databaseOk, latencyMs },
    security,
    payments,
    tenant,
  };
}
