import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { withTenant } from '../../db/client';
import { goals, performanceComments, performanceReviewEntries } from '../../db/schema';
import type {
  CreateCommentDto,
  CreateEmployeeGoalDto,
  CreateReviewEntryDto,
  UpdateCommentDto,
  UpdateEmployeeGoalDto,
  UpdateReviewEntryDto,
} from './dto/employee-performance.dto';

/** Backs the Performance tab's three tables (Reviews, Comments, Goals) on
 *  the People profile. Unlike the self-service `/performance/goals` routes
 *  (an employee managing their own goals), everything here is scoped to an
 *  arbitrary `employeeId` and is Admin-editable, per the People-profile spec. */
@Injectable()
export class EmployeePerformanceService {
  // --- Reviews -----------------------------------------------------------

  listReviews(tenantId: string, employeeId: string) {
    return withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(performanceReviewEntries)
        .where(and(eq(performanceReviewEntries.tenantId, tenantId), eq(performanceReviewEntries.employeeId, employeeId)))
        .orderBy(desc(performanceReviewEntries.date)),
    );
  }

  async addReview(tenantId: string, employeeId: string, dto: CreateReviewEntryDto) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .insert(performanceReviewEntries)
        .values({
          tenantId,
          employeeId,
          reviewerId: dto.reviewerId,
          jobKnowledge: dto.jobKnowledge,
          workQuality: dto.workQuality,
          attendance: dto.attendance,
          communication: dto.communication,
          dependability: dto.dependability,
          date: dto.date ? new Date(dto.date) : new Date(),
        })
        .returning(),
    );
    return row;
  }

  async updateReview(tenantId: string, employeeId: string, id: string, dto: UpdateReviewEntryDto) {
    const { date, ...rest } = dto;
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .update(performanceReviewEntries)
        .set({ ...rest, ...(date !== undefined ? { date: new Date(date) } : {}) })
        .where(
          and(
            eq(performanceReviewEntries.tenantId, tenantId),
            eq(performanceReviewEntries.employeeId, employeeId),
            eq(performanceReviewEntries.id, id),
          ),
        )
        .returning(),
    );
    if (!row) throw new NotFoundException('Review not found.');
    return row;
  }

  async deleteReview(tenantId: string, employeeId: string, id: string) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .delete(performanceReviewEntries)
        .where(
          and(
            eq(performanceReviewEntries.tenantId, tenantId),
            eq(performanceReviewEntries.employeeId, employeeId),
            eq(performanceReviewEntries.id, id),
          ),
        )
        .returning({ id: performanceReviewEntries.id }),
    );
    if (!row) throw new NotFoundException('Review not found.');
    return { id: row.id };
  }

  // --- Comments ------------------------------------------------------

  listComments(tenantId: string, employeeId: string) {
    return withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(performanceComments)
        .where(and(eq(performanceComments.tenantId, tenantId), eq(performanceComments.employeeId, employeeId)))
        .orderBy(desc(performanceComments.date)),
    );
  }

  async addComment(tenantId: string, employeeId: string, dto: CreateCommentDto) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .insert(performanceComments)
        .values({
          tenantId,
          employeeId,
          comment: dto.comment,
          reviewerId: dto.reviewerId,
          date: dto.date ? new Date(dto.date) : new Date(),
        })
        .returning(),
    );
    return row;
  }

  async updateComment(tenantId: string, employeeId: string, id: string, dto: UpdateCommentDto) {
    const { date, ...rest } = dto;
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .update(performanceComments)
        .set({ ...rest, ...(date !== undefined ? { date: new Date(date) } : {}) })
        .where(
          and(
            eq(performanceComments.tenantId, tenantId),
            eq(performanceComments.employeeId, employeeId),
            eq(performanceComments.id, id),
          ),
        )
        .returning(),
    );
    if (!row) throw new NotFoundException('Comment not found.');
    return row;
  }

  async deleteComment(tenantId: string, employeeId: string, id: string) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .delete(performanceComments)
        .where(
          and(
            eq(performanceComments.tenantId, tenantId),
            eq(performanceComments.employeeId, employeeId),
            eq(performanceComments.id, id),
          ),
        )
        .returning({ id: performanceComments.id }),
    );
    if (!row) throw new NotFoundException('Comment not found.');
    return { id: row.id };
  }

  // --- Goals ---------------------------------------------------------

  listGoals(tenantId: string, employeeId: string) {
    return withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(goals)
        .where(and(eq(goals.tenantId, tenantId), eq(goals.employeeId, employeeId)))
        .orderBy(desc(goals.createdAt)),
    );
  }

  async addGoal(tenantId: string, employeeId: string, dto: CreateEmployeeGoalDto) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .insert(goals)
        .values({
          tenantId,
          employeeId,
          title: dto.title,
          description: dto.description,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          supervisorId: dto.supervisorId,
          status: dto.status,
          employeeAssessment: dto.employeeAssessment,
          supervisorAssessment: dto.supervisorAssessment,
        })
        .returning(),
    );
    return row;
  }

  async updateGoal(tenantId: string, employeeId: string, id: string, dto: UpdateEmployeeGoalDto) {
    const { dueDate, ...rest } = dto;
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .update(goals)
        .set({ ...rest, ...(dueDate !== undefined ? { dueDate: new Date(dueDate) } : {}) })
        .where(and(eq(goals.tenantId, tenantId), eq(goals.id, id), eq(goals.employeeId, employeeId)))
        .returning(),
    );
    if (!row) throw new NotFoundException('Goal not found.');
    return row;
  }
}
