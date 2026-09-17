import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { withTenant } from '../../db/client';
import { candidates, requisitions } from '../../db/schema';
import { resolveTenantBySlug } from '../../common/tenant/tenant.util';
import type { CreateRequisitionDto, UpdateRequisitionDto, ApplyDto } from './dto/requisition.dto';

/**
 * Skeleton per the framework doc: the requisition-approval object and the
 * candidate pipeline exist and persist, but the full posting/interview/offer
 * workflow (Sheet 03 of the framework) isn't built out yet — this is the
 * seam to extend for Phase 2.
 */
@Injectable()
export class RequisitionsService {
  findAll(tenantId: string) {
    return withTenant(tenantId, (tx) => tx.select().from(requisitions).where(eq(requisitions.tenantId, tenantId)));
  }

  create(tenantId: string, requestedById: string, dto: CreateRequisitionDto) {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(requisitions)
        .values({ tenantId, requestedById, status: 'PENDING_APPROVAL', ...dto })
        .returning();
      return row;
    });
  }

  async approve(tenantId: string, id: string, approvedById: string | null) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .update(requisitions)
        // publishedAt marks the moment this became visible on the public
        // careers page (CareersService only ever selects status='APPROVED'
        // rows) — it's the "Date" shown there, and what the job list sorts by.
        .set({ status: 'APPROVED', approvedById, publishedAt: new Date() })
        .where(and(eq(requisitions.tenantId, tenantId), eq(requisitions.id, id)))
        .returning(),
    );
    if (!row) throw new NotFoundException('Requisition not found.');
    return row;
  }

  /** Edits a requisition's fields, including the public careers-page content — used before or after approval. */
  async update(tenantId: string, id: string, dto: UpdateRequisitionDto) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .update(requisitions)
        .set(dto)
        .where(and(eq(requisitions.tenantId, tenantId), eq(requisitions.id, id)))
        .returning(),
    );
    if (!row) throw new NotFoundException('Requisition not found.');
    return row;
  }

  listCandidates(tenantId: string, requisitionId: string) {
    return withTenant(tenantId, (tx) =>
      tx.select().from(candidates).where(and(eq(candidates.tenantId, tenantId), eq(candidates.requisitionId, requisitionId))),
    );
  }

  /** Public apply endpoint — resolves the tenant by slug since the candidate isn't authenticated yet. */
  async apply(tenantSlug: string, requisitionId: string, dto: ApplyDto) {
    const tenant = await resolveTenantBySlug(tenantSlug);
    if (!tenant) throw new NotFoundException('Unknown organization.');

    return withTenant(tenant.id, async (tx) => {
      const [requisition] = await tx
        .select()
        .from(requisitions)
        .where(and(eq(requisitions.tenantId, tenant.id), eq(requisitions.id, requisitionId)))
        .limit(1);
      if (!requisition) throw new NotFoundException('Requisition not found.');
      if (requisition.status !== 'APPROVED') throw new BadRequestException('This role is not open for applications.');

      const [candidate] = await tx
        .insert(candidates)
        .values({ tenantId: tenant.id, requisitionId, ...dto })
        .returning();
      return candidate;
    });
  }
}
