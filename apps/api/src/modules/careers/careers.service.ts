import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { db, withTenant } from '../../db/client';
import { organizationSettings, requisitions, tenants } from '../../db/schema';
import { resolveTenantBySlug } from '../../common/tenant/tenant.util';

/**
 * Public careers site. `/careers/[tenantSlug]` (CareersController's
 * `:slug`/`:slug/jobs`/`:slug/jobs/:jobId` routes) is one tenant's job
 * board; bare `/careers` (this file's `listAllJobs`) is every ACTIVE
 * tenant's board pooled together — the "unless a tenant is given" behaviour
 * from the v021.A brief. No account needed for either, same as the existing
 * `POST /requisitions/:id/apply`. An APPROVED requisition is what shows up
 * here; DRAFT/PENDING_APPROVAL/CLOSED ones never do, and none of the
 * internal-only requisition fields (budget, requestedById, approvedById) are
 * ever selected below.
 */
@Injectable()
export class CareersService {
  private async resolveTenant(slug: string) {
    const tenant = await resolveTenantBySlug(slug);
    if (!tenant) throw new NotFoundException('Unknown organization.');
    return tenant;
  }

  /** Cross-tenant job board for bare /careers. RLS scopes every query to one
   *  tenant at a time (see withTenant), so there's no single query that can
   *  pull requisitions across tenants — this fetches the (small, demo-scale)
   *  ACTIVE tenant list untenanted (tenants themselves aren't tenant-scoped,
   *  same as resolveTenantBySlug), then runs the same per-tenant listJobs
   *  query for each and merges the results, newest-published first. */
  async listAllJobs() {
    const activeTenants = await db.select().from(tenants).where(eq(tenants.status, 'ACTIVE'));

    const perTenant = await Promise.all(
      activeTenants.map(async (tenant) => {
        const [settings, jobs] = await withTenant(tenant.id, async (tx) => {
          const [settingsRow] = await tx
            .select({ name: organizationSettings.name, logoUrl: organizationSettings.logoUrl })
            .from(organizationSettings)
            .where(eq(organizationSettings.tenantId, tenant.id))
            .limit(1);
          const jobRows = await tx
            .select({
              id: requisitions.id,
              title: requisitions.title,
              department: requisitions.department,
              employmentType: requisitions.employmentType,
              location: requisitions.location,
              requiredSkills: requisitions.requiredSkills,
              publishedAt: requisitions.publishedAt,
            })
            .from(requisitions)
            .where(and(eq(requisitions.tenantId, tenant.id), eq(requisitions.status, 'APPROVED')));
          return [settingsRow, jobRows] as const;
        });
        const orgName = settings?.name ?? tenant.name;
        return jobs.map((job) => ({
          ...job,
          tenantSlug: tenant.slug,
          tenantName: orgName,
          tenantLogoUrl: settings?.logoUrl ?? null,
        }));
      }),
    );

    return perTenant.flat().sort((a, b) => {
      const at = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const bt = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return bt - at;
    });
  }

  async getOrganization(slug: string) {
    const tenant = await this.resolveTenant(slug);
    const settings = await withTenant(tenant.id, async (tx) => {
      const [row] = await tx
        .select({ name: organizationSettings.name, logoUrl: organizationSettings.logoUrl })
        .from(organizationSettings)
        .where(eq(organizationSettings.tenantId, tenant.id))
        .limit(1);
      return row ?? null;
    });
    return {
      tenantSlug: tenant.slug,
      name: settings?.name ?? tenant.name,
      logoUrl: settings?.logoUrl ?? null,
    };
  }

  async listJobs(slug: string) {
    const tenant = await this.resolveTenant(slug);
    const rows = await withTenant(tenant.id, (tx) =>
      tx
        .select({
          id: requisitions.id,
          title: requisitions.title,
          department: requisitions.department,
          employmentType: requisitions.employmentType,
          location: requisitions.location,
          requiredSkills: requisitions.requiredSkills,
          publishedAt: requisitions.publishedAt,
        })
        .from(requisitions)
        .where(and(eq(requisitions.tenantId, tenant.id), eq(requisitions.status, 'APPROVED')))
        .orderBy(desc(requisitions.publishedAt)),
    );
    return rows;
  }

  async getJob(slug: string, jobId: string) {
    const tenant = await this.resolveTenant(slug);
    const [row] = await withTenant(tenant.id, (tx) =>
      tx
        .select({
          id: requisitions.id,
          title: requisitions.title,
          department: requisitions.department,
          employmentType: requisitions.employmentType,
          location: requisitions.location,
          requiredSkills: requisitions.requiredSkills,
          publishedAt: requisitions.publishedAt,
          roleSummary: requisitions.roleSummary,
          whatYoullDo: requisitions.whatYoullDo,
          whatYoullBring: requisitions.whatYoullBring,
          whatYoullGet: requisitions.whatYoullGet,
          whyUs: requisitions.whyUs,
        })
        .from(requisitions)
        .where(
          and(eq(requisitions.tenantId, tenant.id), eq(requisitions.id, jobId), eq(requisitions.status, 'APPROVED')),
        )
        .limit(1),
    );
    if (!row) throw new NotFoundException('This role is not open for applications.');
    return row;
  }
}
