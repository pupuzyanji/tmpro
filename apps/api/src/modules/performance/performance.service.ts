import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { withTenant } from '../../db/client';
import { employees, goals } from '../../db/schema';
import { MailService } from '../../common/mail/mail.service';
import type { CreateGoalDto, UpdateGoalStatusDto } from './dto/goal.dto';

/**
 * Skeleton per the framework doc: goal-setting works end to end; review
 * cycles and performance reviews are modeled in the schema (see
 * src/db/schema.ts) but not yet exposed here — sequenced after Requisitions
 * per the roadmap (Phase 3). There's no "assign a goal to someone" flow yet
 * either (goals.supervisorId is never set via this API) — the notification
 * below rides on the employee's actual manager (employees.managerId)
 * instead, same source leave.service.ts already uses for its own
 * supervisor notifications.
 */
@Injectable()
export class PerformanceService {
  constructor(private mail: MailService) {}

  myGoals(tenantId: string, employeeId: string) {
    return withTenant(tenantId, (tx) =>
      tx.select().from(goals).where(and(eq(goals.tenantId, tenantId), eq(goals.employeeId, employeeId))),
    );
  }

  async create(tenantId: string, employeeId: string, dto: CreateGoalDto) {
    const { row, employee, manager } = await withTenant(tenantId, async (tx) => {
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

      const [employee] = await tx.select().from(employees).where(and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId))).limit(1);
      const [manager] = employee?.managerId
        ? await tx.select().from(employees).where(and(eq(employees.tenantId, tenantId), eq(employees.id, employee.managerId))).limit(1)
        : [];
      return { row, employee, manager };
    });

    if (manager?.email && employee) {
      await this.mail.send({
        to: manager.email,
        subject: `New performance goal — ${employee.firstName} ${employee.lastName}`,
        text: `${employee.firstName} ${employee.lastName} set a new performance goal: "${row.title}"${
          row.dueDate ? ` (due ${row.dueDate.toDateString()})` : ''
        }.\n\nSign in to tmPro to view it on their Performance tab.`,
      });
    }

    return row;
  }

  async updateStatus(tenantId: string, employeeId: string, id: string, dto: UpdateGoalStatusDto) {
    const { row, employee, manager } = await withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(goals)
        .set({ status: dto.status })
        .where(and(eq(goals.tenantId, tenantId), eq(goals.id, id), eq(goals.employeeId, employeeId)))
        .returning();
      if (!row) throw new NotFoundException('Goal not found.');

      const [employee] = await tx.select().from(employees).where(and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId))).limit(1);
      const [manager] = employee?.managerId
        ? await tx.select().from(employees).where(and(eq(employees.tenantId, tenantId), eq(employees.id, employee.managerId))).limit(1)
        : [];
      return { row, employee, manager };
    });

    if (dto.status === 'COMPLETED' && manager?.email && employee) {
      await this.mail.send({
        to: manager.email,
        subject: `Goal completed — ${employee.firstName} ${employee.lastName}`,
        text: `${employee.firstName} ${employee.lastName} marked "${row.title}" as completed.\n\nSign in to tmPro to review it on their Performance tab.`,
      });
    }

    return row;
  }
}
