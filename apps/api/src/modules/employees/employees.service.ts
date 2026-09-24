import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, or, sql } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { db, withTenant } from '../../db/client';
import { branches, departments, designations, sections, employees, tenants, users } from '../../db/schema';
import { countSeatsUsed } from '../../common/seats/seat-policy';
import { BANDS, isBandKey, nextBand } from '../../common/billing/plans';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../../db/schema';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { importCsvRows } from '../../common/csv/csv-import.util';
import { MailService } from '../../common/mail/mail.service';
import type { CreateEmployeeDto, EmploymentType, UpdateEmployeeDto } from './dto/create-employee.dto';
import type { EditableRole } from './dto/update-employee-role.dto';

const VALID_EMPLOYMENT_TYPES: EmploymentType[] = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'];

/** Columns every list/dropdown view of the People directory actually
 *  renders (People sidebar, Settings → Employees, the Org Chart, the
 *  Training staff list, and every manager-picker dropdown via
 *  useOrgOptions/EmployeeOption). Deliberately excludes the ~35 other
 *  columns on `employees` — personal-detail fields (address, SSN, blood
 *  group, hobbies, ...) and `customFields` (jsonb) that no list view reads
 *  but that used to get pulled over the wire on every load anyway via a
 *  bare `.select()`. `photoUrl` stays in: this build stores uploaded
 *  photos as a full base64 data URI (no object storage/resizing yet), so
 *  it's often the single biggest column — but the list views do render it
 *  as the Avatar thumbnail, so it can't be dropped without losing photos
 *  there. findById/findDetail (the profile page) are untouched — that view
 *  genuinely needs every field. */
const LIST_COLUMNS = {
  id: employees.id,
  employeeCode: employees.employeeCode,
  firstName: employees.firstName,
  lastName: employees.lastName,
  photoUrl: employees.photoUrl,
  jobTitle: employees.jobTitle,
  department: employees.department,
  status: employees.status,
  startDate: employees.startDate,
  managerId: employees.managerId,
  // Small boolean, cheap to include everywhere — Settings > Employees'
  // Timesheets toggle (v022.A) reads it straight off this list rather than
  // needing a separate per-row detail fetch.
  timesheetsEnabled: employees.timesheetsEnabled,
} as const;

// Same default demo password used by src/db/seed.ts — kept as one shared,
// known default here too rather than generating a random one per employee.
// Emailed to each new account (see emailNewLogin below) and also still
// shown on-screen to the Admin/HR who triggered the generation, as a
// fallback for when SMTP isn't configured yet.
export const GENERATED_LOGIN_DEFAULT_PASSWORD = 'Passw0rd!';

// v023.A — Admin/HR "Reset password". How long an emailed reset link stays
// valid before it has to be re-sent.
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Base URL of the web app, for building links inside emails (the reset
// link below, and anything similar later). No NEXT_PUBLIC_ equivalent is
// needed here — this is API-side only, used solely to compose a link text
// that's mailed out, never read by the frontend.
const WEB_APP_URL = process.env.WEB_APP_URL || 'http://localhost:3000';

@Injectable()
export class EmployeesService {
  constructor(private mail: MailService) {}

  /** Every method takes tenantId explicitly and filters by it — the first
   *  (application-level) layer of tenant isolation; withTenant() also sets
   *  the RLS session variable as the second, structural layer. */

  findAll(tenantId: string) {
    return withTenant(tenantId, (tx) =>
      tx.select(LIST_COLUMNS).from(employees).where(eq(employees.tenantId, tenantId)).orderBy(employees.lastName),
    );
  }

  /** People-directory visibility, scoped by the caller's role:
   *  - ADMIN sees the full org directory.
   *  - SUPERVISOR sees their direct reports plus themselves.
   *  - EMPLOYEE (and anyone with no employee profile) sees only themselves,
   *    if they have a profile at all.
   *  This backs the shared `GET /employees` endpoint the People sidebar page
   *  (visible to all three roles) calls — the frontend doesn't need to know
   *  which slice it's getting. All three branches select LIST_COLUMNS only
   *  (see above) — this result is never used as a full employee record. */
  findVisible(tenantId: string, user: AuthenticatedUser) {
    if (user.role === 'ADMIN' || user.role === 'HR') return this.findAll(tenantId);

    if (!user.employeeId) return Promise.resolve([]);

    if (user.role === 'SUPERVISOR') {
      return withTenant(tenantId, (tx) =>
        tx
          .select(LIST_COLUMNS)
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
        .select(LIST_COLUMNS)
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
    const [tenant] = await db
      .select({ seatCap: tenants.seatCap, band: tenants.band, billingStatus: tenants.billingStatus })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!tenant || tenant.seatCap == null) return;

    const seatsUsed = await countSeatsUsed(tenantId);
    if (seatsUsed >= tenant.seatCap) {
      // v025.A — a self-serve (Stripe-billed) tenant can lift its own cap by
      // moving up a size band; point the Admin straight at that.
      if (tenant.billingStatus !== 'MANUAL' && isBandKey(tenant.band)) {
        const up = nextBand(tenant.band);
        throw new BadRequestException(
          up
            ? `You've reached your plan's limit of ${tenant.seatCap} employees. Move up to the ${BANDS[up].label} size in Settings → Billing to add more.`
            : `You've reached your plan's limit of ${tenant.seatCap} employees. Contact tmPro about the 200+ plan in Settings → Billing.`,
        );
      }
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
   *  grants Admin. Everyone gets the same shared default password — each
   *  new account is emailed its login + that password (see
   *  `emailNewLogin` below) once the batch has been created. */
  async generateLogins(tenantId: string) {
    const result = await withTenant(tenantId, async (tx) => {
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

    // Outside the transaction, best-effort: one email per new account. A
    // provider outage never rolls back the accounts already created.
    await Promise.all(result.created.map((c) => this.emailNewLogin(c.email, c.name, c.role)));

    return result;
  }

  /** Onboarding email for a freshly generated login — same message whether
   *  it came from the bulk pass above or the single-employee path below. */
  private async emailNewLogin(email: string, name: string, role: 'SUPERVISOR' | 'EMPLOYEE') {
    await this.mail.send({
      to: email,
      subject: 'Your tmPro account is ready',
      text: `Hi ${name},\n\nAn account has been created for you in tmPro (role: ${role}).\n\nSign in with:\n  Email: ${email}\n  Temporary password: ${GENERATED_LOGIN_DEFAULT_PASSWORD}\n\nPlease sign in and change your password as soon as you can.`,
    });
  }

  /** Single-employee counterpart to the bulk "Generate logins" path above —
   *  same rules (personal email as the login, Supervisor if this person has
   *  direct reports, Employee otherwise, the shared default password)
   *  applied to just this one employee. Backs the Permission tab's own
   *  "Generate Login" button on the People profile, for onboarding a person
   *  one at a time instead of running the bulk pass for the whole tenant. */
  async generateLogin(tenantId: string, employeeId: string) {
    const { row, name } = await withTenant(tenantId, async (tx) => {
      const [emp] = await tx
        .select()
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId)))
        .limit(1);
      if (!emp) throw new NotFoundException('Employee not found.');

      const [existing] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.employeeId, employeeId)))
        .limit(1);
      if (existing) throw new BadRequestException('This person already has a login account.');

      const email = emp.email?.trim().toLowerCase();
      if (!email) {
        throw new BadRequestException('No personal email on file for this person (People profile → Personal Details).');
      }

      const [taken] = await tx.select({ id: users.id }).from(users).where(and(eq(users.tenantId, tenantId), eq(users.email, email))).limit(1);
      if (taken) throw new BadRequestException(`Email "${email}" is already in use by another login.`);

      const [directReport] = await tx
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.managerId, employeeId)))
        .limit(1);
      const role = directReport ? ('SUPERVISOR' as const) : ('EMPLOYEE' as const);

      const passwordHash = await bcrypt.hash(GENERATED_LOGIN_DEFAULT_PASSWORD, 10);
      const [row] = await tx
        .insert(users)
        .values({ tenantId, email, passwordHash, role, employeeId })
        .returning({ id: users.id, email: users.email, role: users.role });

      return { row, name: `${emp.firstName} ${emp.lastName}` };
    });

    await this.emailNewLogin(row.email, name, row.role as 'SUPERVISOR' | 'EMPLOYEE');

    return { ...row, defaultPassword: GENERATED_LOGIN_DEFAULT_PASSWORD };
  }

  /** Admin/HR "Reset password" (v023.A) — People profile → Permission tab,
   *  the counterpart to Generate Login above for someone who already has an
   *  account. Generates a single-use, time-limited token, stores only its
   *  SHA-256 hash (the raw token is never persisted — same reasoning as
   *  hashing passwords, just a fast deterministic hash since this one has
   *  to be looked back up by exact value rather than bcrypt-compared), and
   *  emails the reset link to the account's LOGIN email — not the
   *  employee's personal email, since the login email is what they
   *  actually sign in with, and the two can differ (see
   *  UpdateAccountEmailDto). */
  async resetPassword(tenantId: string, employeeId: string) {
    const result = await withTenant(tenantId, async (tx) => {
      const [account] = await tx
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.employeeId, employeeId)))
        .limit(1);
      if (!account) throw new NotFoundException('This person does not have a login account yet.');

      const [emp] = await tx
        .select({ firstName: employees.firstName, lastName: employees.lastName })
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId)))
        .limit(1);

      const token = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

      await tx
        .update(users)
        .set({ resetTokenHash: tokenHash, resetTokenExpiresAt: expiresAt })
        .where(eq(users.id, account.id));

      return { email: account.email, name: emp ? `${emp.firstName} ${emp.lastName}` : account.email, token };
    });

    const resetUrl = `${WEB_APP_URL}/reset-password?token=${result.token}`;
    await this.mail.send({
      to: result.email,
      subject: 'Reset your tmPro password',
      text: `Hi ${result.name},\n\nAn Admin or HR user requested a password reset for your tmPro account. Use the link below to set a new password — it expires in 1 hour and works once:\n\n${resetUrl}\n\nIf you weren't expecting this, you can ignore this email — your password stays unchanged.`,
    });

    return { email: result.email };
  }

  /** People profile → Permission tab's "Account email" editor (v023.A) —
   *  changes the LOGIN email on an employee's linked account. Admin/HR
   *  only, same as everything else on this tab — but unlike the role
   *  editor above, editing your own login email is allowed here; there's
   *  no "zero Admins" risk in it the way there is with roles. */
  async updateAccountEmail(tenantId: string, employeeId: string, newEmail: string) {
    const email = newEmail.trim().toLowerCase();

    const result = await withTenant(tenantId, async (tx) => {
      const [account] = await tx
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.employeeId, employeeId)))
        .limit(1);
      if (!account) throw new NotFoundException('This person does not have a login account yet.');

      if (email !== account.email.toLowerCase()) {
        const [taken] = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.tenantId, tenantId), sql`lower(${users.email}) = ${email}`))
          .limit(1);
        if (taken) throw new BadRequestException(`Email "${email}" is already in use by another login.`);
      }

      const [updated] = await tx
        .update(users)
        .set({ email })
        .where(eq(users.id, account.id))
        .returning({ id: users.id, email: users.email, role: users.role });

      return { updated, oldEmail: account.email };
    });

    if (result.oldEmail.toLowerCase() !== email) {
      // Best-effort notice to both addresses — the old one, in case this
      // wasn't the account holder's own doing, and the new one, so they
      // know that's now where they sign in. Fire-and-forget, same as every
      // other notification in this file — a mail outage never blocks the
      // change itself (it's already committed above).
      await Promise.all([
        this.mail.send({
          to: result.oldEmail,
          subject: 'Your tmPro login email was changed',
          text: `Your tmPro sign-in email was changed to ${email} by an Admin/HR user. If you weren't expecting this, contact your tmPro administrator.`,
        }),
        this.mail.send({
          to: email,
          subject: 'Your tmPro login email has changed',
          text: `This is now your sign-in email for tmPro (previously ${result.oldEmail}). Use it the next time you sign in.`,
        }),
      ]);
    }

    return result.updated;
  }
}
