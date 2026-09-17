import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { withTenant } from '../../db/client';
import { organizationSettings, requisitions } from '../../db/schema';
import { resolveTenantBySlug } from '../../common/tenant/tenant.util';

/**
 * Public careers site: one job board per tenant, reached at
 * /careers/[tenantSlug] — no account needed, same as the existing
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
