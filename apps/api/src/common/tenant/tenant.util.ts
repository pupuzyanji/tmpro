import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { tenants } from '../../db/schema';

/** Tenants themselves aren't tenant-scoped, so this is a plain (untenanted) lookup. */
export async function resolveTenantBySlug(slug: string) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  return tenant ?? null;
}
