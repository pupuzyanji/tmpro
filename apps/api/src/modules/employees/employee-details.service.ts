import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { withTenant } from '../../db/client';
import { employeeDependents, employeeEducation, employeeWorkExperience } from '../../db/schema';
import type {
  CreateDependentDto,
  CreateEducationDto,
  CreateWorkExperienceDto,
  UpdateDependentDto,
  UpdateEducationDto,
  UpdateWorkExperienceDto,
} from './dto/employee-sub-resources.dto';

/** Backs the General Info tab's three addable sub-lists — Work Experience,
 *  Education, Dependents. Same shape for all three: list by employee, add a
 *  row, edit a row in place (PATCH), delete a row. */
@Injectable()
export class EmployeeDetailsService {
  private toDates<T extends { startDate?: string; endDate?: string; dateOfBirth?: string }>(dto: T) {
    return {
      ...dto,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
    };
  }

  // --- Work Experience ---------------------------------------------------

  listWorkExperience(tenantId: string, employeeId: string) {
    return withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(employeeWorkExperience)
        .where(and(eq(employeeWorkExperience.tenantId, tenantId), eq(employeeWorkExperience.employeeId, employeeId)))
        .orderBy(employeeWorkExperience.startDate),
    );
  }

  addWorkExperience(tenantId: string, employeeId: string, dto: CreateWorkExperienceDto) {
    const { startDate, endDate, ...rest } = this.toDates(dto);
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(employeeWorkExperience)
        .values({ tenantId, employeeId, ...rest, startDate, endDate })
        .returning();
      return row;
    });
  }

  async updateWorkExperience(tenantId: string, employeeId: string, id: string, dto: UpdateWorkExperienceDto) {
    const { startDate, endDate, ...rest } = this.toDates(dto);
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .update(employeeWorkExperience)
        .set({
          ...rest,
          ...(dto.startDate !== undefined ? { startDate } : {}),
          ...(dto.endDate !== undefined ? { endDate } : {}),
        })
        .where(
          and(
            eq(employeeWorkExperience.tenantId, tenantId),
            eq(employeeWorkExperience.employeeId, employeeId),
            eq(employeeWorkExperience.id, id),
          ),
        )
        .returning(),
    );
    if (!row) throw new NotFoundException('Work experience entry not found.');
    return row;
  }

  async deleteWorkExperience(tenantId: string, employeeId: string, id: string) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .delete(employeeWorkExperience)
        .where(
          and(
            eq(employeeWorkExperience.tenantId, tenantId),
            eq(employeeWorkExperience.employeeId, employeeId),
            eq(employeeWorkExperience.id, id),
          ),
        )
        .returning({ id: employeeWorkExperience.id }),
    );
    if (!row) throw new NotFoundException('Work experience entry not found.');
    return { id: row.id };
  }

  // --- Education -----------------------------------------------------

  listEducation(tenantId: string, employeeId: string) {
    return withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(employeeEducation)
        .where(and(eq(employeeEducation.tenantId, tenantId), eq(employeeEducation.employeeId, employeeId)))
        .orderBy(employeeEducation.startDate),
    );
  }

  addEducation(tenantId: string, employeeId: string, dto: CreateEducationDto) {
    const { startDate, endDate, ...rest } = this.toDates(dto);
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(employeeEducation)
        .values({ tenantId, employeeId, ...rest, startDate, endDate })
        .returning();
      return row;
    });
  }

  async updateEducation(tenantId: string, employeeId: string, id: string, dto: UpdateEducationDto) {
    const { startDate, endDate, ...rest } = this.toDates(dto);
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .update(employeeEducation)
        .set({
          ...rest,
          ...(dto.startDate !== undefined ? { startDate } : {}),
          ...(dto.endDate !== undefined ? { endDate } : {}),
        })
        .where(
          and(
            eq(employeeEducation.tenantId, tenantId),
            eq(employeeEducation.employeeId, employeeId),
            eq(employeeEducation.id, id),
          ),
        )
        .returning(),
    );
    if (!row) throw new NotFoundException('Education entry not found.');
    return row;
  }

  async deleteEducation(tenantId: string, employeeId: string, id: string) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .delete(employeeEducation)
        .where(
          and(
            eq(employeeEducation.tenantId, tenantId),
            eq(employeeEducation.employeeId, employeeId),
            eq(employeeEducation.id, id),
          ),
        )
        .returning({ id: employeeEducation.id }),
    );
    if (!row) throw new NotFoundException('Education entry not found.');
    return { id: row.id };
  }

  // --- Dependents ----------------------------------------------------

  listDependents(tenantId: string, employeeId: string) {
    return withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(employeeDependents)
        .where(and(eq(employeeDependents.tenantId, tenantId), eq(employeeDependents.employeeId, employeeId)))
        .orderBy(employeeDependents.name),
    );
  }

  addDependent(tenantId: string, employeeId: string, dto: CreateDependentDto) {
    const { dateOfBirth, ...rest } = this.toDates(dto);
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(employeeDependents)
        .values({ tenantId, employeeId, ...rest, dateOfBirth })
        .returning();
      return row;
    });
  }

  async updateDependent(tenantId: string, employeeId: string, id: string, dto: UpdateDependentDto) {
    const { dateOfBirth, ...rest } = this.toDates(dto);
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .update(employeeDependents)
        .set({
          ...rest,
          ...(dto.dateOfBirth !== undefined ? { dateOfBirth } : {}),
        })
        .where(
          and(
            eq(employeeDependents.tenantId, tenantId),
            eq(employeeDependents.employeeId, employeeId),
            eq(employeeDependents.id, id),
          ),
        )
        .returning(),
    );
    if (!row) throw new NotFoundException('Dependent entry not found.');
    return row;
  }

  async deleteDependent(tenantId: string, employeeId: string, id: string) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .delete(employeeDependents)
        .where(
          and(
            eq(employeeDependents.tenantId, tenantId),
            eq(employeeDependents.employeeId, employeeId),
            eq(employeeDependents.id, id),
          ),
        )
        .returning({ id: employeeDependents.id }),
    );
    if (!row) throw new NotFoundException('Dependent entry not found.');
    return { id: row.id };
  }
}
