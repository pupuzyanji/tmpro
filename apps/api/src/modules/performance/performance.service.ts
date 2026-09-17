import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { withTenant } from '../../db/client';
import { goals } from '../../db/schema';
import type { CreateGoalDto, UpdateGoalStatusDto } from './dto/goal.dto';

/**
 * Skeleton per the framework doc: goal-setting works end to end; review
 * cycles and performance reviews are modeled in the schema (see
 * src/db/schema.ts) but not yet exposed here — sequenced after Requisitions
 * per the roadmap (Phase 3).
 */
@Injectable()
export class PerformanceService {
  myGoals(tenantId: string, employeeId: string) {
    return withTenant(tenantId, (tx) =>
      tx.select().from(goals).where(and(eq(goals.tenantId, tenantId), eq(goals.employeeId, employeeId))),
    );
  }

  create(tenantId: string, employeeId: string, dto: CreateGoalDto) {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(goals)
        .values({
          tenantId,
          employeeId,
          title: dto.title,
          description: dto.description,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        })
        .returning();
      return row;
    });
  }

  async updateStatus(tenantId: string, employeeId: string, id: string, dto: UpdateGoalStatusDto) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .update(goals)
        .set({ status: dto.status })
        .where(and(eq(goals.tenantId, tenantId), eq(goals.id, id), eq(goals.employeeId, employeeId)))
        .returning(),
    );
    if (!row) throw new NotFoundException('Goal not found.');
    return row;
  }
}
