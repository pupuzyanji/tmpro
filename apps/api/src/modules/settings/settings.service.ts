import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { withTenant } from '../../db/client';
import {
  announcementReads,
  announcements,
  branches,
  departments,
  designations,
  employees,
  leaveTypes,
  organizationSettings,
  sections,
} from '../../db/schema';
import { importCsvRows } from '../../common/csv/csv-import.util';
import { MailService } from '../../common/mail/mail.service';
import type {
  BulkUpdateLeaveTypesDto,
  CreateAnnouncementDto,
  CreateBranchDto,
  CreateDepartmentDto,
  CreateDesignationDto,
  CreateSectionDto,
  UpdateAnnouncementDto,
  UpdateBranchDto,
  UpdateDepartmentDto,
  UpdateDesignationDto,
  UpdateOrganizationDto,
  UpdateSectionDto,
} from './dto/settings.dto';

// The fixed leave-type catalog every country regime is provisioned with the
// first time an Admin opens it in Settings → Leave — names lifted from the
// attached Zambian statutory-baseline list, deliberately excluding "Public
// Holidays" (that's a calendar concept, not a balance-tracked leave type).
// `isPaid: false` only for Unpaid Leave — see leaveTypes.isPaid.
const LEAVE_TYPE_CATALOG: Array<{ name: string; isPaid: boolean }> = [
  { name: 'Annual Leave', isPaid: true },
  { name: 'Sick Leave – Long-term Contract', isPaid: true },
  { name: 'Sick Leave – Short-term Contract', isPaid: true },
  { name: 'Maternity Leave', isPaid: true },
  { name: 'Paternity Leave', isPaid: true },
  { name: 'Compassionate/Special Leave', isPaid: true },
  { name: 'Study Leave', isPaid: true },
  { name: 'Unpaid Leave', isPaid: false },
  { name: 'Other Leave', isPaid: true },
];

// Reasonable starting defaults for the Zambia regime only, taken from the
// statutory-baseline table the catalog names above came from. Every other
// regime (NZ excepted — payroll-only, not part of this catalog — MW, ZA,
// OTHER) is provisioned at 0 days / Annually / no carry-over, i.e. blank and
// ready for an Admin to fill in. These are a starting point, not legal
// advice — confirm against current Zambian labour law before relying on
// them, and adjust freely from Settings → Leave (Update → edit → Save).
const ZM_LEAVE_DEFAULTS: Record<string, { days: number; period: 'DAILY' | 'MONTHLY' | 'ANNUALLY'; carryOver: boolean }> = {
  'Annual Leave': { days: 2, period: 'MONTHLY', carryOver: true },
  'Sick Leave – Long-term Contract': { days: 90, period: 'ANNUALLY', carryOver: false },
  'Sick Leave – Short-term Contract': { days: 52, period: 'ANNUALLY', carryOver: false },
  'Maternity Leave': { days: 98, period: 'ANNUALLY', carryOver: false },
  'Paternity Leave': { days: 5, period: 'ANNUALLY', carryOver: false },
  'Compassionate/Special Leave': { days: 7, period: 'ANNUALLY', carryOver: false },
  'Study Leave': { days: 10, period: 'ANNUALLY', carryOver: false },
  'Unpaid Leave': { days: 0, period: 'ANNUALLY', carryOver: false },
  'Other Leave': { days: 0, period: 'ANNUALLY', carryOver: false },
};

@Injectable()
export class SettingsService {
  constructor(private mail: MailService) {}

  // --- Organization (single row per tenant) -------------------------------

  async getOrganization(tenantId: string) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx.select().from(organizationSettings).where(eq(organizationSettings.tenantId, tenantId)).limit(1),
    );
    // A tenant created before this settings table existed (or that has never
    // opened Settings → Organization) won't have a row yet — hand back sane
    // defaults rather than a 404, since this is a "define it" form.
    return (
      row ?? {
        id: null,
        tenantId,
        name: null,
        logoUrl: null,
        tagline: null,
        street: null,
        townCity: null,
        province: null,
        country: null,
        currency: 'ZMW',
        workingHoursStart: '08:00',
        workingHoursEnd: '17:00',
        timezone: 'Africa/Lusaka',
        superannuationNo: null,
        taxId: null,
        healthInsuranceId: null,
        updatedAt: null,
      }
    );
  }

  async updateOrganization(tenantId: string, dto: UpdateOrganizationDto) {
    return withTenant(tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: organizationSettings.id })
        .from(organizationSettings)
        .where(eq(organizationSettings.tenantId, tenantId))
        .limit(1);

      if (existing) {
        const [row] = await tx
          .update(organizationSettings)
          .set({ ...dto, updatedAt: new Date() })
          .where(eq(organizationSettings.tenantId, tenantId))
          .returning();
        return row;
      }

      const [row] = await tx
        .insert(organizationSettings)
        .values({ tenantId, ...dto })
        .returning();
      return row;
    });
  }

  // --- Branches ------------------------------------------------------------

  listBranches(tenantId: string) {
    return withTenant(tenantId, (tx) =>
      tx.select().from(branches).where(eq(branches.tenantId, tenantId)).orderBy(branches.name),
    );
  }

  createBranch(tenantId: string, dto: CreateBranchDto) {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(branches)
        .values({ tenantId, ...dto })
        .returning();
      return row;
    });
  }

  async updateBranch(tenantId: string, id: string, dto: UpdateBranchDto) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .update(branches)
        .set(dto)
        .where(and(eq(branches.tenantId, tenantId), eq(branches.id, id)))
        .returning(),
    );
    if (!row) throw new NotFoundException('Branch not found.');
    return row;
  }

  async deleteBranch(tenantId: string, id: string) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .delete(branches)
        .where(and(eq(branches.tenantId, tenantId), eq(branches.id, id)))
        .returning({ id: branches.id }),
    );
    if (!row) throw new NotFoundException('Branch not found.');
    return { id: row.id };
  }

  importBranches(tenantId: string, buffer: Buffer) {
    // Expected columns: name, isHeadOffice (0/1 or true/false), street,
    // townCity, province, country
    return importCsvRows(buffer, async (r) => {
      const name = r.name?.trim();
      if (!name) throw new Error('"name" is required.');
      await this.createBranch(tenantId, {
        name,
        isHeadOffice: /^(1|true|yes)$/i.test(r.isHeadOffice ?? '') ? 1 : 0,
        street: r.street?.trim() || undefined,
        townCity: r.townCity?.trim() || undefined,
        province: r.province?.trim() || undefined,
        country: r.country?.trim() || undefined,
      });
    });
  }

  // --- Departments -----------------------------------------------------

  listDepartments(tenantId: string) {
    return withTenant(tenantId, (tx) =>
      tx.select().from(departments).where(eq(departments.tenantId, tenantId)).orderBy(departments.name),
    );
  }

  createDepartment(tenantId: string, dto: CreateDepartmentDto) {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(departments)
        .values({ tenantId, ...dto })
        .returning();
      return row;
    });
  }

  async updateDepartment(tenantId: string, id: string, dto: UpdateDepartmentDto) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .update(departments)
        .set(dto)
        .where(and(eq(departments.tenantId, tenantId), eq(departments.id, id)))
        .returning(),
    );
    if (!row) throw new NotFoundException('Department not found.');
    return row;
  }

  async deleteDepartment(tenantId: string, id: string) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .delete(departments)
        .where(and(eq(departments.tenantId, tenantId), eq(departments.id, id)))
        .returning({ id: departments.id }),
    );
    if (!row) throw new NotFoundException('Department not found.');
    return { id: row.id };
  }

  importDepartments(tenantId: string, buffer: Buffer) {
    // Expected columns: name
    return importCsvRows(buffer, async (r) => {
      const name = r.name?.trim();
      if (!name) throw new Error('"name" is required.');
      await this.createDepartment(tenantId, { name });
    });
  }

  // --- Sections (nested under a Department) ---------------------------

  listSections(tenantId: string, departmentId?: string) {
    return withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(sections)
        .where(
          departmentId
            ? and(eq(sections.tenantId, tenantId), eq(sections.departmentId, departmentId))
            : eq(sections.tenantId, tenantId),
        )
        .orderBy(sections.name),
    );
  }

  async createSection(tenantId: string, dto: CreateSectionDto) {
    await this.assertDepartment(tenantId, dto.departmentId);
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(sections)
        .values({ tenantId, ...dto })
        .returning();
      return row;
    });
  }

  async updateSection(tenantId: string, id: string, dto: UpdateSectionDto) {
    if (dto.departmentId) await this.assertDepartment(tenantId, dto.departmentId);
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .update(sections)
        .set(dto)
        .where(and(eq(sections.tenantId, tenantId), eq(sections.id, id)))
        .returning(),
    );
    if (!row) throw new NotFoundException('Section not found.');
    return row;
  }

  async deleteSection(tenantId: string, id: string) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .delete(sections)
        .where(and(eq(sections.tenantId, tenantId), eq(sections.id, id)))
        .returning({ id: sections.id }),
    );
    if (!row) throw new NotFoundException('Section not found.');
    return { id: row.id };
  }

  importSections(tenantId: string, buffer: Buffer) {
    // Expected columns: department (name), name
    return importCsvRows(buffer, async (r) => {
      const deptName = r.department?.trim();
      const name = r.name?.trim();
      if (!deptName || !name) throw new Error('"department" and "name" are required.');
      const [dept] = await withTenant(tenantId, (tx) =>
        tx
          .select({ id: departments.id })
          .from(departments)
          .where(and(eq(departments.tenantId, tenantId), eq(departments.name, deptName)))
          .limit(1),
      );
      if (!dept) throw new Error(`No department named "${deptName}".`);
      await this.createSection(tenantId, { departmentId: dept.id, name });
    });
  }

  private async assertDepartment(tenantId: string, departmentId: string) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .select({ id: departments.id })
        .from(departments)
        .where(and(eq(departments.tenantId, tenantId), eq(departments.id, departmentId)))
        .limit(1),
    );
    if (!row) throw new BadRequestException('That department does not exist.');
  }

  // --- Designations (with a reports-to relationship) -----------------------

  listDesignations(tenantId: string) {
    return withTenant(tenantId, (tx) =>
      tx.select().from(designations).where(eq(designations.tenantId, tenantId)).orderBy(designations.title),
    );
  }

  createDesignation(tenantId: string, dto: CreateDesignationDto) {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(designations)
        .values({ tenantId, ...dto })
        .returning();
      return row;
    });
  }

  async updateDesignation(tenantId: string, id: string, dto: UpdateDesignationDto) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .update(designations)
        .set(dto)
        .where(and(eq(designations.tenantId, tenantId), eq(designations.id, id)))
        .returning(),
    );
    if (!row) throw new NotFoundException('Designation not found.');
    return row;
  }

  async deleteDesignation(tenantId: string, id: string) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .delete(designations)
        .where(and(eq(designations.tenantId, tenantId), eq(designations.id, id)))
        .returning({ id: designations.id }),
    );
    if (!row) throw new NotFoundException('Designation not found.');
    return { id: row.id };
  }

  importDesignations(tenantId: string, buffer: Buffer) {
    // Expected columns: title, reportsTo (title of another designation, optional)
    return importCsvRows(buffer, async (r) => {
      const title = r.title?.trim();
      if (!title) throw new Error('"title" is required.');
      let reportsToDesignationId: string | undefined;
      const reportsToTitle = r.reportsTo?.trim();
      if (reportsToTitle) {
        const [parent] = await withTenant(tenantId, (tx) =>
          tx
            .select({ id: designations.id })
            .from(designations)
            .where(and(eq(designations.tenantId, tenantId), eq(designations.title, reportsToTitle)))
            .limit(1),
        );
        if (!parent) throw new Error(`No designation titled "${reportsToTitle}" to report to.`);
        reportsToDesignationId = parent.id;
      }
      await this.createDesignation(tenantId, { title, reportsToDesignationId });
    });
  }

  // --- Announcements ---------------------------------------------------

  listAnnouncements(tenantId: string) {
    return withTenant(tenantId, (tx) =>
      tx.select().from(announcements).where(eq(announcements.tenantId, tenantId)).orderBy(announcements.createdAt),
    );
  }

  async createAnnouncement(tenantId: string, createdById: string | null, dto: CreateAnnouncementDto) {
    const { row, recipients } = await withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(announcements)
        .values({ tenantId, createdById: createdById ?? undefined, ...dto })
        .returning();

      // Scope mirrors announcementsForEmployee()'s filter, inverted: who is
      // in scope for THIS announcement, rather than which announcements are
      // in scope for one employee.
      const scoped = await tx
        .select({ email: employees.email })
        .from(employees)
        .where(
          and(
            eq(employees.tenantId, tenantId),
            row.scope === 'DEPARTMENT' && row.departmentId
              ? eq(employees.departmentId, row.departmentId)
              : row.scope === 'SECTION' && row.sectionId
                ? eq(employees.sectionId, row.sectionId)
                : undefined,
          ),
        );
      const recipients = scoped.map((e) => e.email).filter((e): e is string => !!e);

      return { row, recipients };
    });

    await Promise.all(
      recipients.map((to) =>
        this.mail.send({
          to,
          subject: `Announcement: ${row.title}`,
          text: row.body,
        }),
      ),
    );

    return row;
  }

  /** Scope-aware: switching scope away from DEPARTMENT/SECTION clears the
   *  now-irrelevant departmentId/sectionId, regardless of what the frontend
   *  happened to send for them. */
  async updateAnnouncement(tenantId: string, id: string, dto: UpdateAnnouncementDto) {
    const patch: Partial<typeof announcements.$inferInsert> = { ...dto };
    if (dto.scope === 'ORGANIZATION') {
      patch.departmentId = null;
      patch.sectionId = null;
    } else if (dto.scope === 'DEPARTMENT') {
      patch.sectionId = null;
    } else if (dto.scope === 'SECTION') {
      patch.departmentId = null;
    }
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .update(announcements)
        .set(patch)
        .where(and(eq(announcements.tenantId, tenantId), eq(announcements.id, id)))
        .returning(),
    );
    if (!row) throw new NotFoundException('Announcement not found.');
    return row;
  }

  async deleteAnnouncement(tenantId: string, id: string) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .delete(announcements)
        .where(and(eq(announcements.tenantId, tenantId), eq(announcements.id, id)))
        .returning({ id: announcements.id }),
    );
    if (!row) throw new NotFoundException('Announcement not found.');
    return { id: row.id };
  }

  /** Announcements relevant to one employee's dashboard: org-wide ones, plus
   *  ones scoped to their department or section — each flagged `read` from
   *  that employee's own read receipts, so the dashboard can show an unread
   *  count/list. */
  async announcementsForEmployee(tenantId: string, employeeId: string) {
    const [emp] = await withTenant(tenantId, (tx) =>
      tx
        .select({ departmentId: employees.departmentId, sectionId: employees.sectionId })
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId)))
        .limit(1),
    );
    const [all, reads] = await Promise.all([
      this.listAnnouncements(tenantId),
      withTenant(tenantId, (tx) =>
        tx
          .select({ announcementId: announcementReads.announcementId })
          .from(announcementReads)
          .where(and(eq(announcementReads.tenantId, tenantId), eq(announcementReads.employeeId, employeeId))),
      ),
    ]);
    const readIds = new Set(reads.map((r) => r.announcementId));
    return all
      .filter((a) => {
        if (a.scope === 'ORGANIZATION') return true;
        if (a.scope === 'DEPARTMENT') return emp?.departmentId && a.departmentId === emp.departmentId;
        if (a.scope === 'SECTION') return emp?.sectionId && a.sectionId === emp.sectionId;
        return false;
      })
      .map((a) => ({ ...a, read: readIds.has(a.id) }));
  }

  /** Marks one announcement as read for this employee — idempotent (a second
   *  call is a harmless no-op via ON CONFLICT DO NOTHING). */
  async markAnnouncementRead(tenantId: string, employeeId: string, announcementId: string) {
    await withTenant(tenantId, (tx) =>
      tx
        .insert(announcementReads)
        .values({ tenantId, employeeId, announcementId })
        .onConflictDoNothing({ target: [announcementReads.announcementId, announcementReads.employeeId] }),
    );
    return { id: announcementId, read: true };
  }

  // --- Leave (per-country-regime leave-type catalog) ---------------------

  /** Returns this regime's leave-type catalog, provisioning it from
   *  `LEAVE_TYPE_CATALOG` (blank, or the Zambia statutory-baseline defaults
   *  for 'ZM') the first time it's opened — so every regime always has the
   *  same 9 rows to configure, never an empty table. */
  async listLeaveTypes(tenantId: string, countryCode: string) {
    return withTenant(tenantId, async (tx) => {
      const existing = await tx
        .select()
        .from(leaveTypes)
        .where(and(eq(leaveTypes.tenantId, tenantId), eq(leaveTypes.countryCode, countryCode)));
      const existingNames = new Set(existing.map((r) => r.name));
      const missing = LEAVE_TYPE_CATALOG.filter((c) => !existingNames.has(c.name));
      if (missing.length === 0) return existing.sort((a, b) => LEAVE_TYPE_CATALOG.findIndex((c) => c.name === a.name) - LEAVE_TYPE_CATALOG.findIndex((c) => c.name === b.name));

      const defaults = countryCode === 'ZM' ? ZM_LEAVE_DEFAULTS : {};
      const inserted = await tx
        .insert(leaveTypes)
        .values(
          missing.map((c) => ({
            tenantId,
            countryCode,
            name: c.name,
            isPaid: c.isPaid,
            defaultAnnualDays: defaults[c.name]?.days ?? 0,
            accrualPeriod: defaults[c.name]?.period ?? 'ANNUALLY',
            carryOverEnabled: defaults[c.name]?.carryOver ?? false,
          })),
        )
        .returning();
      const all = [...existing, ...inserted];
      return all.sort((a, b) => LEAVE_TYPE_CATALOG.findIndex((c) => c.name === a.name) - LEAVE_TYPE_CATALOG.findIndex((c) => c.name === b.name));
    });
  }

  async bulkUpdateLeaveTypes(tenantId: string, dto: BulkUpdateLeaveTypesDto) {
    return withTenant(tenantId, async (tx) => {
      const rows = [];
      for (const r of dto.rows) {
        const [row] = await tx
          .update(leaveTypes)
          .set({
            defaultAnnualDays: r.defaultAnnualDays,
            accrualPeriod: r.accrualPeriod,
            carryOverEnabled: r.carryOverEnabled,
          })
          .where(and(eq(leaveTypes.tenantId, tenantId), eq(leaveTypes.id, r.id), eq(leaveTypes.countryCode, dto.countryCode)))
          .returning();
        if (!row) throw new NotFoundException(`Leave type ${r.id} not found for ${dto.countryCode}.`);
        rows.push(row);
      }
      return rows;
    });
  }
}
