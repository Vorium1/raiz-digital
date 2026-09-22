import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { incrementQueryCount } from "@/lib/db-query-count";

// Em desenvolvimento, o Fast Refresh do Next.js pode reavaliar este módulo a
// cada alteração de arquivo, o que recriaria o pool (e vazaria as conexões
// antigas, nunca fechadas) a cada hot-reload. Guardando a instância em
// `globalThis` -- mesmo padrão documentado pelo Prisma para Next.js -- o
// pool sobrevive aos recarregamentos e conexões não se acumulam numa sessão
// de dev longa. Em produção (uma instância por processo) isso não muda nada.
declare global {
  // eslint-disable-next-line no-var
  var __raizPgPool: Pool | undefined;
}

let pool: Pool | undefined;

function databaseUrl() {
  const value = (process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL)?.trim();
  if (!value) throw new Error("DATABASE_URL não configurada.");
  return value;
}

function createPool() {
  return new Pool({
    connectionString: databaseUrl(),
    max: Number(process.env.DB_POOL_MAX ?? "10"),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
    ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
  });
}

export function getPool() {
  if (process.env.NODE_ENV !== "production") {
    if (!globalThis.__raizPgPool) globalThis.__raizPgPool = createPool();
    return globalThis.__raizPgPool;
  }
  if (!pool) pool = createPool();
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  incrementQueryCount();
  return getPool().query<T>(text, values);
}

export type TenantDbContext = {
  tenantId: string;
  userId?: string | null;
};

export async function withTenant<T>(context: TenantDbContext, work: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();
  // Fase 4E, Bloco 1 -- envolve `client.query` (mesma instância, usada por TODO chamador de `work`) pra
  // contar round-trips reais, inclusive o BEGIN/set_config/COMMIT abaixo. Cast pragmático (`as any`):
  // `PoolClient.query` tem várias sobrecargas de tipo do driver `pg`; isso é só instrumentação de medição,
  // nunca muda o comportamento real da consulta.
  //
  // Achado real (auditando a própria instrumentação): o `pg.Pool` reaproveita o MESMO objeto `PoolClient`
  // entre `connect()`/`release()` de conexões ociosas -- sem restaurar `client.query` no `finally`, cada
  // `withTenant` novo empilhava mais uma camada de wrapper por cima da anterior no mesmo cliente reciclado,
  // inflando a contagem a cada reuso da conexão (confirmado comparando a primeira chamada de uma conexão
  // nova, que contava certo, com chamadas seguintes na MESMA conexão reciclada, que contavam em dobro/
  // triplo). Restaurar o método original antes de `release()` evita esse acúmulo.
  const originalQuery = client.query.bind(client);
  (client as unknown as { query: unknown }).query = (...args: Parameters<typeof originalQuery>) => {
    const first = args[0];
    incrementQueryCount(typeof first === "string" ? first : (first as { text?: string })?.text);
    return (originalQuery as (...a: unknown[]) => unknown)(...args);
  };
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
    (client as unknown as { query: unknown }).query = originalQuery;
    client.release();
  }
}
