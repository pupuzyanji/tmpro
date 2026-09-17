import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { db, withTenant } from '../../db/client';
import { branches, departments, designations, sections, employees, tenants, users } from '../../db/schema';
import { countSeatsUsed } from '../../common/seats/seat-policy';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../../db/schema';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { importCsvRows } from '../../common/csv/csv-import.util';
import { MailService } from '../../common/mail/mail.service';
import type { CreateEmployeeDto, EmploymentType, UpdateEmployeeDto } from './dto/create-employee.dto';
import type { EditableRole } from './dto/update-employee-role.dto';

const VALID_EMPLOYMENT_TYPES: EmploymentType[] = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'];

// Same default demo password used by src/db/seed.ts — kept as one shared,
// known default here too rather than generating a random one per employee,
// since nothing in this scaffold can email credentials out; the Admin reads
// it off the response and communicates it to staff themselves.
export const GENERATED_LOGIN_DEFAULT_PASSWORD = 'Passw0rd!';

@Injectable()
export class EmployeesService {
  constructor(private mail: MailService) {}

  /** Every method takes tenantId explicitly and filters by it — the first
   *  (application-level) layer of tenant isolation; withTenant() also sets
   *  the RLS session variable as the second, structural layer. */

  findAll(tenantId: string) {
    return withTenant(tenantId, (tx) =>
      tx.select().from(employees).where(eq(employees.tenantId, tenantId)).orderBy(employees.lastName),
    );
  }

  /** People-directory visibility, scoped by the caller's role:
   *  - ADMIN sees the full org directory.
   *  - SUPERVISOR sees their direct reports plus themselves.
   *  - EMPLOYEE (and anyone with no employee profile) sees only themselves,
   *    if they have a profile at all.
   *  This backs the shared `GET /employees` endpoint the People sidebar page
   *  (visible to all three roles) calls — the frontend doesn't need to know
   *  which slice it's getting. */
  findVisible(tenantId: string, user: AuthenticatedUser) {
    if (user.role === 'ADMIN' || user.role === 'HR') return this.findAll(tenantId);

    if (!user.employeeId) return Promise.resolve([]);

    if (user.role === 'SUPERVISOR') {
      return withTenant(tenantId, (tx) =>
        tx
          .select()
          .from(employees)
          .where(
            and(
              eq(employees.tenantId, tenantId),
              or(eq(employees.managerId, user.employeeId as string), eq(employees.id, user.employeeId as string)),
            ),
          )
          .orderBy(employees.lastName),
      );
    }

    // EMPLOYEE (and CANDIDATE, if ever routed here): self only.
    return withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.id, user.employeeId as string))),
    );
  }

  /** Shared authorization check for anything scoped to one employee — the
   *  profile detail view and every People-tab sub-resource (work experience,
   *  education, dependents, Job/Performance history). Admin: always allowed.
   *  Supervisor: allowed for their team (including themselves). Employee:
   *  only their own id. Throws ForbiddenException otherwise. */
  async assertVisible(tenantId: string, user: AuthenticatedUser, employeeId: string): Promise<void> {
    if (user.role === 'ADMIN' || user.role === 'HR') return;
    if (user.role === 'EMPLOYEE') {
      if (user.employeeId !== employeeId) throw new ForbiddenException('You can only view your own profile.');
      return;
    }
    if (user.role === 'SUPERVISOR') {
      const visible = await this.findVisible(tenantId, user);
      if (!visible.some((e) => e.id === employeeId)) {
        throw new ForbiddenException('You can only view your own team.');
      }
      return;
    }
    throw new ForbiddenException('Not allowed.');
  }

  findReports(tenantId: string, managerId: string) {
    return withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.managerId, managerId))),
    );
  }

  async findById(tenantId: string, id: string) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.id, id)))
        .limit(1),
    );
    if (!row) throw new NotFoundException('Employee not found.');
    return row;
  }

  /** Detail view for the People module: the employee plus their manager and
   *  linked login account (email/role), so the profile page doesn't need
   *  three separate round-trips. */
  async findDetail(tenantId: string, id: string) {
    const row = await withTenant(tenantId, (tx) =>
      tx.query.employees.findFirst({
        where: and(eq(employees.tenantId, tenantId), eq(employees.id, id)),
        with: { manager: true },
      }),
    );
    if (!row) throw new NotFoundException('Employee not found.');

    const [account] = await withTenant(tenantId, (tx) =>
      tx
        .select({ email: users.email, role: users.role })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.employeeId, id)))
        .limit(1),
    );

    return { ...row, account: account ?? null };
  }

  /** People profile → Permission tab's role editor (v019.A), Admin-only.
   *  Changes the role on the employee's linked login account — an employee
   *  with no login yet has nothing to change (findDetail's `account` is
   *  null in that case, and the frontend hides the editor accordingly).
   *  Blocks an Admin from changing their own role so a tenant can't end up
   *  with zero Admins from one click; there's no "last Admin" check beyond
   *  that, same light-touch approach as the rest of this scaffold. */
  async updateRole(tenantId: string, employeeId: string, role: EditableRole, actingUser: AuthenticatedUser) {
    if (actingUser.employeeId === employeeId) {
      throw new BadRequestException('You cannot change your own role.');
    }
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .update(users)
        .set({ role })
        .where(and(eq(users.tenantId, tenantId), eq(users.employeeId, employeeId)))
        .returning({ id: users.id, email: users.email, role: users.role }),
    );
    if (!row) throw new NotFoundException('This person does not have a login account yet.');
    return row;
  }

  async create(tenantId: string, dto: CreateEmployeeDto) {
    await this.assertSeatAvailable(tenantId);

    const { startDate, ...rest } = dto;
    return withTenant(tenantId, async (tx) => {
      const denorm = await this.resolveDenormalizedFields(tx, tenantId, dto);
      const [row] = await tx
        .insert(employees)
        .values({ tenantId, ...rest, ...(startDate ? { startDate: new Date(startDate) } : {}), ...denorm })
        .returning();
      return row;
    });
  }

  /** Platform-admin-managed seat cap (v018.A) — `tenants.seatCap`, null
   *  meaning unlimited. Checked here rather than only in the frontend so it
   *  actually holds for the bulk "Generate logins" path too (that loop
   *  calls this same `create()` per row — see below). A cap crossed mid-CSV
   *  import will fail the rows past the cap individually, same as any other
   *  per-row validation error `importCsvRows` already surfaces. */
  private async assertSeatAvailable(tenantId: string): Promise<void> {
    const [tenant] = await db.select({ seatCap: tenants.seatCap }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!tenant || tenant.seatCap == null) return;

    const seatsUsed = await countSeatsUsed(tenantId);
    if (seatsUsed >= tenant.seatCap) {
      throw new BadRequestException(
        `This organization has reached its seat cap (${tenant.seatCap}). Contact your tmPro administrator to add more.`,
      );
    }
  }

  async update(tenantId: string, id: string, dto: UpdateEmployeeDto) {
    const before = await this.findById(tenantId, id);
    const { startDate, dateOfBirth, ...rest } = dto;
    // class-validator's @IsDateString keeps these as ISO strings on the DTO;
    // Drizzle's timestamp columns want actual Date objects.
    const dateFields: Partial<typeof employees.$inferInsert> = {};
    if (startDate !== undefined) dateFields.startDate = new Date(startDate);
    if (dateOfBirth !== undefined) dateFields.dateOfBirth = new Date(dateOfBirth);
    const [row] = await withTenant(tenantId, async (tx) => {
      const denorm = await this.resolveDenormalizedFields(tx, tenantId, dto);
      return tx
        .update(employees)
        .set({ ...rest, ...dateFields, ...denorm, updatedAt: new Date() } as Partial<typeof employees.$inferInsert>)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.id, id)))
        .returning();
    });

    await this.notifyIfDetailsChanged(before, row);

    return row;
  }

  /** Employee-detail-changed notification — compares the handful of fields
   *  that actually matter to the employee (their job title, department,
   *  manager, and employment type) and emails them a plain summary of what
   *  changed, if anything did. Ignores everything else (photo, contact
   *  details, custom fields, etc.) so routine edits don't generate noise. */
  private async notifyIfDetailsChanged(before: typeof employees.$inferSelect, after: typeof employees.$inferSelect) {
    if (!after.email) return;

    const changes: string[] = [];
    if (before.jobTitle !== after.jobTitle) {
      changes.push(`Job title: ${before.jobTitle ?? '(none)'} → ${after.jobTitle ?? '(none)'}`);
    }
    if (before.department !== after.department) {
      changes.push(`Department: ${before.department ?? '(none)'} → ${after.department ?? '(none)'}`);
    }
    if (before.employmentType !== after.employmentType) {
      changes.push(`Employment type: ${before.employmentType} → ${after.employmentType}`);
    }
    if (before.managerId !== after.managerId) {
      const [oldMgr, newMgr] = await Promise.all([
        before.managerId ? this.findById(after.tenantId, before.managerId).catch(() => null) : Promise.resolve(null),
        after.managerId ? this.findById(after.tenantId, after.managerId).catch(() => null) : Promise.resolve(null),
      ]);
      const oldName = oldMgr ? `${oldMgr.firstName} ${oldMgr.lastName}` : '(none)';
      const newName = newMgr ? `${newMgr.firstName} ${newMgr.lastName}` : '(none)';
      changes.push(`Manager: ${oldName} → ${newName}`);
    }

    if (changes.length === 0) return;

    await this.mail.send({
      to: after.email,
      subject: 'Your employee details have been updated',
      text: `The following details on your tmPro profile were changed:\n\n${changes.join('\n')}\n\nSign in to tmPro if you have any questions.`,
    });
  }

  /** Settings → Employees / People-tab CSV import. Expected columns:
   *  employeeCode, firstName, lastName, jobTitle, branch, department, section,
   *  designation, employmentType, sourceOfHire, startDate, managerCode
   *  (another row's employeeCode, must already exist), countryCode.
   *  Rows are imported one at a time so a bad row doesn't block the rest. */
  importEmployees(tenantId: string, buffer: Buffer) {
    return importCsvRows(buffer, async (r) => {
      const firstName = r.firstName?.trim();
      const lastName = r.lastName?.trim();
      if (!firstName || !lastName) throw new Error('"firstName" and "lastName" are required.');

      let managerId: string | undefined;
      const managerCode = r.managerCode?.trim();
      if (managerCode) {
        const [mgr] = await withTenant(tenantId, (tx) =>
          tx
            .select({ id: employees.id })
            .from(employees)
            .where(and(eq(employees.tenantId, tenantId), eq(employees.employeeCode, managerCode)))
            .limit(1),
        );
        if (!mgr) throw new Error(`No existing employee with employeeCode "${managerCode}" to report to.`);
        managerId = mgr.id;
      }

      const employmentTypeRaw = r.employmentType?.trim().toUpperCase();
      if (employmentTypeRaw && !VALID_EMPLOYMENT_TYPES.includes(employmentTypeRaw as EmploymentType)) {
        throw new Error(`"employmentType" must be one of ${VALID_EMPLOYMENT_TYPES.join(', ')}.`);
      }

      const dto: CreateEmployeeDto = {
        firstName,
        lastName,
        employeeCode: r.employeeCode?.trim() || undefined,
        jobTitle: r.jobTitle?.trim() || undefined,
        countryCode: r.countryCode?.trim() || undefined,
        managerId,
        sourceOfHire: r.sourceOfHire?.trim() || undefined,
        workPhone: r.workPhone?.trim() || undefined,
        employmentType: employmentTypeRaw as EmploymentType | undefined,
      };

      if (r.branch?.trim()) {
        const name = r.branch.trim();
        const [row] = await withTenant(tenantId, (tx) =>
          tx.select({ id: branches.id }).from(branches).where(and(eq(branches.tenantId, tenantId), eq(branches.name, name))).limit(1),
        );
        if (!row) throw new Error(`No branch named "${name}".`);
        dto.branchId = row.id;
      }
      if (r.department?.trim()) {
        const name = r.department.trim();
        const [row] = await withTenant(tenantId, (tx) =>
          tx
            .select({ id: departments.id })
            .from(departments)
            .where(and(eq(departments.tenantId, tenantId), eq(departments.name, name)))
            .limit(1),
        );
        if (!row) throw new Error(`No department named "${name}".`);
        dto.departmentId = row.id;
      }
      if (r.section?.trim()) {
        const name = r.section.trim();
        const [row] = await withTenant(tenantId, (tx) =>
          tx.select({ id: sections.id }).from(sections).where(and(eq(sections.tenantId, tenantId), eq(sections.name, name))).limit(1),
        );
        if (!row) throw new Error(`No section named "${name}".`);
        dto.sectionId = row.id;
      }
      if (r.designation?.trim()) {
        const title = r.designation.trim();
        const [row] = await withTenant(tenantId, (tx) =>
          tx
            .select({ id: designations.id })
            .from(designations)
            .where(and(eq(designations.tenantId, tenantId), eq(designations.title, title)))
            .limit(1),
        );
        if (!row) throw new Error(`No designation titled "${title}".`);
        dto.designationId = row.id;
      }

      await this.create(tenantId, dto);
    });
  }

  /** When a structured org link (department/designation) is set, keep the
   *  legacy free-text `department`/`jobTitle` columns in sync so every
   *  existing page that reads those plain columns keeps working unchanged. */
  private async resolveDenormalizedFields(
    tx: NodePgDatabase<typeof schema>,
    tenantId: string,
    dto: Partial<CreateEmployeeDto & UpdateEmployeeDto>,
  ): Promise<Partial<typeof employees.$inferInsert>> {
    const patch: Partial<typeof employees.$inferInsert> = {};

    if (dto.departmentId && dto.department === undefined) {
      const [dept] = await tx
        .select({ name: departments.name })
        .from(departments)
        .where(and(eq(departments.tenantId, tenantId), eq(departments.id, dto.departmentId)))
        .limit(1);
      if (dept) patch.department = dept.name;
    }

    if (dto.designationId && dto.jobTitle === undefined) {
      const [des] = await tx
        .select({ title: designations.title })
        .from(designations)
        .where(and(eq(designations.tenantId, tenantId), eq(designations.id, dto.designationId)))
        .limit(1);
      if (des) patch.jobTitle = des.title;
    }

    return patch;
  }

  /** Bulk-creates login accounts (`users` rows) for every employee in the
   *  tenant who doesn't already have one, keyed on their personal email
   *  (`employees.email`) — Supervisor if anyone else's `managerId` points at
   *  them, Employee otherwise. Never touches an employee that already has a
   *  linked login (so existing demo/admin accounts are untouched), and never
   *  grants Admin. Everyone gets the same shared default password, since
   *  there's no way to email credentials out of this scaffold. */
  async generateLogins(tenantId: string) {
    return withTenant(tenantId, async (tx) => {
      const allEmployees = await tx.select().from(employees).where(eq(employees.tenantId, tenantId));
      const existingUsers = await tx.select().from(users).where(eq(users.tenantId, tenantId));

      const linkedEmployeeIds = new Set(existingUsers.filter((u) => u.employeeId).map((u) => u.employeeId as string));
      const takenEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()));
      const managerIds = new Set(allEmployees.filter((e) => e.managerId).map((e) => e.managerId as string));

      const created: Array<{ employeeId: string; name: string; email: string; role: 'SUPERVISOR' | 'EMPLOYEE' }> = [];
      const skipped: Array<{ employeeId: string; name: string; reason: string }> = [];

      const passwordHash = await bcrypt.hash(GENERATED_LOGIN_DEFAULT_PASSWORD, 10);

      for (const emp of allEmployees) {
        const name = `${emp.firstName} ${emp.lastName}`;
        if (linkedEmployeeIds.has(emp.id)) {
          skipped.push({ employeeId: emp.id, name, reason: 'Already has a login.' });
          continue;
        }
        const email = emp.email?.trim().toLowerCase();
        if (!email) {
          skipped.push({ employeeId: emp.id, name, reason: 'No personal email on file.' });
          continue;
        }
        if (takenEmails.has(email)) {
          skipped.push({ employeeId: emp.id, name, reason: `Email "${email}" is already in use by another login.` });
          continue;
        }

        const role = managerIds.has(emp.id) ? ('SUPERVISOR' as const) : ('EMPLOYEE' as const);
        await tx.insert(users).values({ tenantId, email, passwordHash, role, employeeId: emp.id });
        takenEmails.add(email); // guards against two employees sharing one personal email
        created.push({ employeeId: emp.id, name, email, role });
      }

      return { created, skipped, defaultPassword: GENERATED_LOGIN_DEFAULT_PASSWORD };
    });
  }
}
