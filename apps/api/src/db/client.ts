import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from './schema';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/** Untenanted handle — only for auth lookups (by email, pre-tenant-resolution) and seeding. */
export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });

/**
 * Runs `fn` inside a transaction with `app.current_tenant_id` set for the
 * session, so the Postgres RLS policies (drizzle/0001_rls.sql) scope every
 * query in `fn` to this tenant — the structural backstop behind the
 * explicit `eq(table.tenantId, tenantId)` filters each service also applies.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: NodePgDatabase<typeof schema>) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_tenant_id', ${tenantId}, true)`);
    return fn(tx as unknown as NodePgDatabase<typeof schema>);
  });
}
