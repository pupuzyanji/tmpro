import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { withTenant } from '../../db/client';
import {
  branches,
  employeeCompensationHistory,
  employeeJobHistory,
  employeeStatusHistory,
  employeeTypeHistory,
} from '../../db/schema';
import { EmployeesService } from './employees.service';
import type {
  AddCompensationHistoryDto,
  AddJobHistoryDto,
  AddStatusHistoryDto,
  AddTypeHistoryDto,
  UpdateCompensationHistoryDto,
  UpdateJobHistoryDto,
  UpdateStatusHistoryDto,
  UpdateTypeHistoryDto,
} from './dto/employee-history.dto';

/** Backs the Job tab's four dated history sections (Employee Status,
 *  Employment Type, Compensation, Job Information). Each "Update"/"+Add"
 *  appends a new row to its own append-only log AND pushes the same change
 *  onto the live `employees` row (via EmployeesService.update, which also
 *  keeps the denormalized department/jobTitle text columns in sync) — so
 *  General Info's "Work" section always reflects the latest history entry
 *  without a second read. Admin can also edit any past entry in place (PATCH
 *  routes below) — after any edit, the employee's denormalized "current"
 *  fields are re-derived from whichever row is now latest by effectiveDate,
 *  so editing an old OR the current entry both stay consistent. */
@Injectable()
export class EmployeeHistoryService {
  constructor(private employees: EmployeesService) {}

  // --- Employee Status ---------------------------------------------------

  listStatusHistory(tenantId: string, employeeId: string) {
    return withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(employeeStatusHistory)
        .where(and(eq(employeeStatusHistory.tenantId, tenantId), eq(employeeStatusHistory.employeeId, employeeId)))
        .orderBy(desc(employeeStatusHistory.effectiveDate)),
    );
  }

  async addStatusHistory(tenantId: string, employeeId: string, createdById: string | null, dto: AddStatusHistoryDto) {
    const effectiveDate = dto.effectiveDate ? new Date(dto.effectiveDate) : new Date();
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .insert(employeeStatusHistory)
        .values({
          tenantId,
          employeeId,
          status: dto.status,
          comment: dto.comment,
          effectiveDate,
          createdById: createdById ?? undefined,
        })
        .returning(),
    );
    await this.employees.update(tenantId, employeeId, { status: dto.status });
    return row;
  }

  async updateStatusHistory(tenantId: string, employeeId: string, id: string, dto: UpdateStatusHistoryDto) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .update(employeeStatusHistory)
        .set({
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.comment !== undefined ? { comment: dto.comment } : {}),
          ...(dto.effectiveDate !== undefined ? { effectiveDate: new Date(dto.effectiveDate) } : {}),
        })
        .where(
          and(
            eq(employeeStatusHistory.tenantId, tenantId),
            eq(employeeStatusHistory.employeeId, employeeId),
            eq(employeeStatusHistory.id, id),
          ),
        )
        .returning(),
    );
    if (!row) throw new NotFoundException('Status history entry not found.');

    const [latest] = await withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(employeeStatusHistory)
        .where(and(eq(employeeStatusHistory.tenantId, tenantId), eq(employeeStatusHistory.employeeId, employeeId)))
        .orderBy(desc(employeeStatusHistory.effectiveDate))
        .limit(1),
    );
    if (latest) await this.employees.update(tenantId, employeeId, { status: latest.status });
    return row;
  }

  /** Admin-only. Removes the row entirely (not a status change) and
   *  re-derives the employee's denormalized "current" status from whichever
   *  entry is now latest by effectiveDate — same re-derivation the PATCH
   *  route above does, so deleting the current entry falls back cleanly to
   *  the next one instead of leaving a stale value. If that was the only
   *  entry, the employee's current status field is left as-is (there's
   *  nothing left to derive it from). */
  async deleteStatusHistory(tenantId: string, employeeId: string, id: string) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .delete(employeeStatusHistory)
        .where(
          and(
            eq(employeeStatusHistory.tenantId, tenantId),
            eq(employeeStatusHistory.employeeId, employeeId),
            eq(employeeStatusHistory.id, id),
          ),
        )
        .returning(),
    );
    if (!row) throw new NotFoundException('Status history entry not found.');

    const [latest] = await withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(employeeStatusHistory)
        .where(and(eq(employeeStatusHistory.tenantId, tenantId), eq(employeeStatusHistory.employeeId, employeeId)))
        .orderBy(desc(employeeStatusHistory.effectiveDate))
        .limit(1),
    );
    if (latest) await this.employees.update(tenantId, employeeId, { status: latest.status });
    return row;
  }

  // --- Employment Type -----------------------------------------------

  listTypeHistory(tenantId: string, employeeId: string) {
    return withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(employeeTypeHistory)
        .where(and(eq(employeeTypeHistory.tenantId, tenantId), eq(employeeTypeHistory.employeeId, employeeId)))
        .orderBy(desc(employeeTypeHistory.effectiveDate)),
    );
  }

  async addTypeHistory(tenantId: string, employeeId: string, createdById: string | null, dto: AddTypeHistoryDto) {
    const effectiveDate = dto.effectiveDate ? new Date(dto.effectiveDate) : new Date();
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .insert(employeeTypeHistory)
        .values({
          tenantId,
          employeeId,
          employmentType: dto.employmentType,
          comment: dto.comment,
          effectiveDate,
          createdById: createdById ?? undefined,
        })
        .returning(),
    );
    await this.employees.update(tenantId, employeeId, { employmentType: dto.employmentType });
    return row;
  }

  async updateTypeHistory(tenantId: string, employeeId: string, id: string, dto: UpdateTypeHistoryDto) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .update(employeeTypeHistory)
        .set({
          ...(dto.employmentType !== undefined ? { employmentType: dto.employmentType } : {}),
          ...(dto.comment !== undefined ? { comment: dto.comment } : {}),
          ...(dto.effectiveDate !== undefined ? { effectiveDate: new Date(dto.effectiveDate) } : {}),
        })
        .where(
          and(
            eq(employeeTypeHistory.tenantId, tenantId),
            eq(employeeTypeHistory.employeeId, employeeId),
            eq(employeeTypeHistory.id, id),
          ),
        )
        .returning(),
    );
    if (!row) throw new NotFoundException('Employment type history entry not found.');

    const [latest] = await withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(employeeTypeHistory)
        .where(and(eq(employeeTypeHistory.tenantId, tenantId), eq(employeeTypeHistory.employeeId, employeeId)))
        .orderBy(desc(employeeTypeHistory.effectiveDate))
        .limit(1),
    );
    if (latest) await this.employees.update(tenantId, employeeId, { employmentType: latest.employmentType });
    return row;
  }

  /** Admin-only. Same delete-then-re-derive pattern as deleteStatusHistory. */
  async deleteTypeHistory(tenantId: string, employeeId: string, id: string) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .delete(employeeTypeHistory)
        .where(
          and(
            eq(employeeTypeHistory.tenantId, tenantId),
            eq(employeeTypeHistory.employeeId, employeeId),
            eq(employeeTypeHistory.id, id),
          ),
        )
        .returning(),
    );
    if (!row) throw new NotFoundException('Employment type history entry not found.');

    const [latest] = await withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(employeeTypeHistory)
        .where(and(eq(employeeTypeHistory.tenantId, tenantId), eq(employeeTypeHistory.employeeId, employeeId)))
        .orderBy(desc(employeeTypeHistory.effectiveDate))
        .limit(1),
    );
    if (latest) await this.employees.update(tenantId, employeeId, { employmentType: latest.employmentType });
    return row;
  }

  // --- Compensation ----------------------------------------------------

  listCompensationHistory(tenantId: string, employeeId: string) {
    return withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(employeeCompensationHistory)
        .where(
          and(
            eq(employeeCompensationHistory.tenantId, tenantId),
            eq(employeeCompensationHistory.employeeId, employeeId),
          ),
        )
        .orderBy(desc(employeeCompensationHistory.effectiveDate)),
    );
  }

  async addCompensationHistory(
    tenantId: string,
    employeeId: string,
    createdById: string | null,
    dto: AddCompensationHistoryDto,
  ) {
    const effectiveDate = dto.effectiveDate ? new Date(dto.effectiveDate) : new Date();
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .insert(employeeCompensationHistory)
        .values({
          tenantId,
          employeeId,
          payRate: dto.payRate,
          payType: dto.payType,
          currency: dto.currency || 'ZMW',
          changeReason: dto.changeReason,
          allowances: dto.allowances ?? [],
          hoursPerWeek: dto.hoursPerWeek,
          comment: dto.comment,
          effectiveDate,
          createdById: createdById ?? undefined,
        })
        .returning(),
    );
    await this.syncCompensationDenorm(tenantId, employeeId);
    return row;
  }

  async updateCompensationHistory(
    tenantId: string,
    employeeId: string,
    id: string,
    dto: UpdateCompensationHistoryDto,
  ) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .update(employeeCompensationHistory)
        .set({
          ...(dto.payRate !== undefined ? { payRate: dto.payRate } : {}),
          ...(dto.payType !== undefined ? { payType: dto.payType } : {}),
          ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
          ...(dto.changeReason !== undefined ? { changeReason: dto.changeReason } : {}),
          ...(dto.allowances !== undefined ? { allowances: dto.allowances } : {}),
          ...(dto.hoursPerWeek !== undefined ? { hoursPerWeek: dto.hoursPerWeek } : {}),
          ...(dto.comment !== undefined ? { comment: dto.comment } : {}),
          ...(dto.effectiveDate !== undefined ? { effectiveDate: new Date(dto.effectiveDate) } : {}),
        })
        .where(
          and(
            eq(employeeCompensationHistory.tenantId, tenantId),
            eq(employeeCompensationHistory.employeeId, employeeId),
            eq(employeeCompensationHistory.id, id),
          ),
        )
        .returning(),
    );
    if (!row) throw new NotFoundException('Compensation history entry not found.');
    await this.syncCompensationDenorm(tenantId, employeeId);
    return row;
  }

  /** Admin-only. Deletes the row and re-derives annualSalary from whichever
   *  compensation entry is now latest (syncCompensationDenorm already
   *  no-ops cleanly if none remain). Note: this only removes the history
   *  row — it does not retroactively touch any payslip a past payroll run
   *  already generated using this entry's numbers. */
  async deleteCompensationHistory(tenantId: string, employeeId: string, id: string) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .delete(employeeCompensationHistory)
        .where(
          and(
            eq(employeeCompensationHistory.tenantId, tenantId),
            eq(employeeCompensationHistory.employeeId, employeeId),
            eq(employeeCompensationHistory.id, id),
          ),
        )
        .returning(),
    );
    if (!row) throw new NotFoundException('Compensation history entry not found.');
    await this.syncCompensationDenorm(tenantId, employeeId);
    return row;
  }

  /** Keeps the headline annualSalary current from whichever compensation row
   *  is now latest by effectiveDate (only meaningful for an ANNUAL pay
   *  type — monthly/hourly rates don't map cleanly onto that single field). */
  private async syncCompensationDenorm(tenantId: string, employeeId: string) {
    const [latest] = await withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(employeeCompensationHistory)
        .where(
          and(
            eq(employeeCompensationHistory.tenantId, tenantId),
            eq(employeeCompensationHistory.employeeId, employeeId),
          ),
        )
        .orderBy(desc(employeeCompensationHistory.effectiveDate))
        .limit(1),
    );
    if (latest && (!latest.payType || latest.payType === 'ANNUAL')) {
      await this.employees.update(tenantId, employeeId, { annualSalary: latest.payRate });
    }
  }

  // --- Job Information -------------------------------------------------

  /** Resolves a Branch id to the denormalized "Town/City, Country" display
   *  string used for Job Information's Location. Falls back to whatever
   *  `location` text was given directly when no branch resolves (e.g. a
   *  branch with incomplete address fields, or no branch selected). */
  private async resolveLocation(
    tenantId: string,
    locationBranchId: string | undefined,
    fallback: string | undefined,
  ): Promise<{ location: string | undefined; locationBranchId: string | undefined }> {
    if (!locationBranchId) return { location: fallback, locationBranchId: undefined };
    const [branch] = await withTenant(tenantId, (tx) =>
      tx.select().from(branches).where(and(eq(branches.tenantId, tenantId), eq(branches.id, locationBranchId))).limit(1),
    );
    if (!branch) return { location: fallback, locationBranchId: undefined };
    const parts = [branch.townCity, branch.country].filter((p) => p && p.trim());
    return { location: parts.length ? parts.join(', ') : fallback, locationBranchId: branch.id };
  }

  listJobHistory(tenantId: string, employeeId: string) {
    return withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(employeeJobHistory)
        .where(and(eq(employeeJobHistory.tenantId, tenantId), eq(employeeJobHistory.employeeId, employeeId)))
        .orderBy(desc(employeeJobHistory.effectiveDate)),
    );
  }

  async addJobHistory(tenantId: string, employeeId: string, createdById: string | null, dto: AddJobHistoryDto) {
    const effectiveDate = dto.effectiveDate ? new Date(dto.effectiveDate) : new Date();
    const { location, locationBranchId } = await this.resolveLocation(tenantId, dto.locationBranchId, dto.location);
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .insert(employeeJobHistory)
        .values({
          tenantId,
          employeeId,
          location,
          locationBranchId,
          departmentId: dto.departmentId,
          designationId: dto.designationId,
          managerId: dto.managerId,
          comment: dto.comment,
          effectiveDate,
          createdById: createdById ?? undefined,
        })
        .returning(),
    );
    await this.employees.update(tenantId, employeeId, {
      location,
      departmentId: dto.departmentId,
      designationId: dto.designationId,
      managerId: dto.managerId,
    });
    return row;
  }

  async updateJobHistory(tenantId: string, employeeId: string, id: string, dto: UpdateJobHistoryDto) {
    let locationFields: { location?: string; locationBranchId?: string } = {};
    if (dto.locationBranchId !== undefined || dto.location !== undefined) {
      const resolved = await this.resolveLocation(tenantId, dto.locationBranchId, dto.location);
      locationFields = { location: resolved.location, locationBranchId: resolved.locationBranchId };
    }
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .update(employeeJobHistory)
        .set({
          ...locationFields,
          ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId } : {}),
          ...(dto.designationId !== undefined ? { designationId: dto.designationId } : {}),
          ...(dto.managerId !== undefined ? { managerId: dto.managerId } : {}),
          ...(dto.comment !== undefined ? { comment: dto.comment } : {}),
          ...(dto.effectiveDate !== undefined ? { effectiveDate: new Date(dto.effectiveDate) } : {}),
        })
        .where(
          and(
            eq(employeeJobHistory.tenantId, tenantId),
            eq(employeeJobHistory.employeeId, employeeId),
            eq(employeeJobHistory.id, id),
          ),
        )
        .returning(),
    );
    if (!row) throw new NotFoundException('Job history entry not found.');

    const [latest] = await withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(employeeJobHistory)
        .where(and(eq(employeeJobHistory.tenantId, tenantId), eq(employeeJobHistory.employeeId, employeeId)))
        .orderBy(desc(employeeJobHistory.effectiveDate))
        .limit(1),
    );
    if (latest) {
      await this.employees.update(tenantId, employeeId, {
        location: latest.location ?? undefined,
        departmentId: latest.departmentId ?? undefined,
        designationId: latest.designationId ?? undefined,
        managerId: latest.managerId ?? undefined,
      });
    }
    return row;
  }

  /** Admin-only. Same delete-then-re-derive pattern as the other three
   *  history types, re-deriving location/department/designation/manager
   *  from whichever job-info entry is now latest. */
  async deleteJobHistory(tenantId: string, employeeId: string, id: string) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .delete(employeeJobHistory)
        .where(
          and(
            eq(employeeJobHistory.tenantId, tenantId),
            eq(employeeJobHistory.employeeId, employeeId),
            eq(employeeJobHistory.id, id),
          ),
        )
        .returning(),
    );
    if (!row) throw new NotFoundException('Job history entry not found.');

    const [latest] = await withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(employeeJobHistory)
        .where(and(eq(employeeJobHistory.tenantId, tenantId), eq(employeeJobHistory.employeeId, employeeId)))
        .orderBy(desc(employeeJobHistory.effectiveDate))
        .limit(1),
    );
    if (latest) {
      await this.employees.update(tenantId, employeeId, {
        location: latest.location ?? undefined,
        departmentId: latest.departmentId ?? undefined,
        designationId: latest.designationId ?? undefined,
        managerId: latest.managerId ?? undefined,
      });
    }
    return row;
  }
}
