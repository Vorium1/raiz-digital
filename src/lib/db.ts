import { Pool, type PoolClient, type QueryResultRow } from "pg";

let pool: Pool | undefined;

function databaseUrl() {
  const value = (process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL)?.trim();
  if (!value) throw new Error("DATABASE_URL não configurada.");
  return value;
}

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl(),
      max: Number(process.env.DB_POOL_MAX ?? "10"),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
      ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  return getPool().query<T>(text, values);
}

export type TenantDbContext = {
  tenantId: string;
  userId?: string | null;
};

export async function withTenant<T>(context: TenantDbContext, work: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [context.tenantId]);
    await client.query("SELECT set_config('app.user_id', $1, true)", [context.userId ?? ""]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
