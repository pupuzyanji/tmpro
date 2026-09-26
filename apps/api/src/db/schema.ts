// tmPro — Drizzle schema
//
// Multi-tenancy pattern: every tenant-scoped table carries `tenantId`.
// Application-level isolation is enforced by always routing reads/writes
// through the tenant-scoped repository helpers in `src/common/tenant/`,
// which merge `eq(table.tenantId, tenantId)` into every query. Postgres
// Row-Level Security policies (see drizzle/0002_rls.sql) are the second,
// structural layer of defence — a missing filter in application code still
// can't leak another tenant's rows.

import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  integer,
  doublePrecision,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
  boolean,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Tenancy & auth
// ---------------------------------------------------------------------------

// HR added v019.A (follow-up) — everything an Admin can do except the
// Organization/Branches/Departments/Designations config tabs under
// Settings (see SettingsController for the per-endpoint split).
export const roleEnum = pgEnum('role', ['ADMIN', 'SUPERVISOR', 'EMPLOYEE', 'CANDIDATE', 'HR']);

// A tenant the platform owner provisions (v019.A) starts INACTIVE — it
// can't sign in — until the platform owner explicitly activates it from
// the Platform Admin "Inactive Tenants" tab. Deactivating an active tenant
// moves it back here rather than deleting it. See TenantsAdminService and
// AuthService.login()'s status check.
export const tenantStatusEnum = pgEnum('tenant_status', ['ACTIVE', 'INACTIVE']);

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  name: text('name').notNull(),
  // Platform-owner-managed entitlements (v018.A) — which of tmPro's modules
  // (see common/modules/module-catalog.ts; same keys as the public
  // "Register your organisation" form's feature checklist) this tenant can
  // use, and an optional cap on active employee seats. `enabledModules` is
  // checked by ModuleGuard on the handful of controllers that back an
  // optional module; a route with no @RequiresModule() isn't affected.
  // `seatCap: null` means unlimited — see EmployeesService.create().
  enabledModules: text('enabled_modules').array().notNull().default([]),
  seatCap: integer('seat_cap'),
  // v019.A — see tenantStatusEnum above. Defaults INACTIVE so a freshly
  // provisioned tenant can't log in until the platform owner activates it;
  // tenants that existed before this column was added are grandfathered to
  // ACTIVE by the 0021 migration's backfill.
  status: tenantStatusEnum('status').notNull().default('INACTIVE'),
  // v025.A — subscription billing. `plan`/`band` decide `enabledModules` and
  // `seatCap` for self-serve (Stripe-billed) tenants — see
  // common/billing/plans.ts. `billingStatus` mirrors the Stripe subscription
  // (TRIALING/ACTIVE/PAST_DUE/CANCELED/INCOMPLETE/UNPAID); MANUAL means the
  // platform owner manages this tenant by hand and it is never charged
  // through Stripe (every pre-v025 tenant, and 200+ "Contact us" customers).
  plan: varchar('plan', { length: 20 }),
  band: varchar('band', { length: 10 }),
  billingStatus: varchar('billing_status', { length: 30 }).notNull().default('MANUAL'),
  billingEmail: varchar('billing_email', { length: 255 }),
  country: varchar('country', { length: 120 }),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
  trialEndsAt: timestamp('trial_ends_at'),
  currentPeriodEnd: timestamp('current_period_end'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// v025.A — processed Stripe webhook event ids, so a redelivered event is
// only ever applied once. Un-tenanted, like `tenants`.
export const billingEvents = pgTable('billing_events', {
  id: varchar('id', { length: 255 }).primaryKey(),
  type: varchar('type', { length: 100 }).notNull(),
  receivedAt: timestamp('received_at').defaultNow().notNull(),
});

// Platform-owner accounts (v018.A) — the tmPro operator, not a tenant's own
// ADMIN. Deliberately its own un-tenanted table, outside the RLS
// tenant-isolation list, same as `tenants` and `org_signup_requests`: a
// platform admin's whole reason to exist is seeing/editing *across*
// tenants, which per-tenant RLS is specifically designed to prevent. Signs
// in via a separate `/platform-admin/auth/login`, never the tenant-scoped
// `/auth/login` — see PlatformAdminAuthService and its JWT strategy, which
// carries a `scope: 'platform'` claim the regular tenant JwtStrategy
// rejects (and vice versa), so a token from one flow can't be replayed
// against the other.
export const platformAdmins = pgTable('platform_admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const orgSignupStatusEnum = pgEnum('org_signup_status', ['NEW', 'CONTACTED', 'CONVERTED', 'DECLINED']);

// Lead capture from the public "Register your organisation" form on the
// login page — a request to become a tmPro tenant, not a tenant itself.
// tmPro doesn't yet have self-serve tenant creation (an ops person reviews
// these and provisions the tenant manually), so this is deliberately its
// own un-tenanted table, outside the RLS tenant-isolation list in
// drizzle/0002_rls.sql, same as `tenants` itself.
export const orgSignupRequests = pgTable('org_signup_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 160 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  // v023.A — "Sign-up Here" form's Phone number field (country-code dropdown
  // + local number, combined into one string, e.g. "+260 971234567").
  // Nullable at the DB layer even though the current DTO always sends it, so
  // pre-existing rows from before this column existed stay valid.
  phone: varchar('phone', { length: 40 }),
  organisationName: varchar('organisation_name', { length: 200 }).notNull(),
  country: varchar('country', { length: 120 }).notNull(),
  staffComplement: integer('staff_complement').notNull(),
  // Which of tmPro's modules they're interested in — checkboxes on the form.
  featuresNeeded: text('features_needed').array().notNull().default([]),
  status: orgSignupStatusEnum('status').notNull().default('NEW'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    role: roleEnum('role').notNull(),
    employeeId: uuid('employee_id').references(() => employees.id),
    candidateId: uuid('candidate_id').references(() => candidates.id),
    // v019.A — set for a tenant's ADMIN account created via the
    // platform-admin "Add Tenant" flow (TenantsAdminService), so the
    // platform owner has a name to show/edit without requiring the admin
    // to also be an Employee record. Null for logins created any other way
    // (e.g. seed.ts's employee/supervisor accounts, which get their name
    // from the linked `employees` row instead).
    firstName: varchar('first_name', { length: 120 }),
    lastName: varchar('last_name', { length: 120 }),
    // v023.A — Admin/HR "Reset password" (People profile > Permission tab):
    // a single-use, time-limited token for the emailed reset link. Only the
    // SHA-256 hash is stored (never the raw token — see
    // EmployeesService.resetPassword()), since this needs to be looked up
    // by exact value rather than compared the slow, salted way bcrypt
    // compares actual passwords. Both null once unused/consumed/expired.
    resetTokenHash: varchar('reset_token_hash', { length: 64 }),
    resetTokenExpiresAt: timestamp('reset_token_expires_at'),
    // v027.A — forces a password change at next sign-in (generated
    // temporary passwords). See AuthService.login().
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    // Drizzle can't express a functional (lower(email)) unique index here —
    // the *actual* DB constraint, applied by the hand-written
    // drizzle/0017_case_insensitive_email.sql migration (same reason the RLS
    // policies aren't representable in this file either), is case-insensitive:
    // `UNIQUE (tenant_id, lower(email))`. Keep email comparisons in
    // application code (AuthService, generateLogins, seed.ts) lower-cased to
    // match.
    uniqueIndex('users_tenant_email_uq').on(t.tenantId, t.email),
    index('users_tenant_idx').on(t.tenantId),
    index('users_reset_token_idx').on(t.resetTokenHash),
  ],
);

// ---------------------------------------------------------------------------
// Module 1 — Employee Profiles
// ---------------------------------------------------------------------------

export const employeeStatusEnum = pgEnum('employee_status', [
  'ONBOARDING',
  'ACTIVE',
  'ON_LEAVE',
  'OFFBOARDING',
  'ALUMNI',
]);

export const employmentTypeEnum = pgEnum('employment_type', ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']);
export const genderEnum = pgEnum('gender', ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']);
export const maritalStatusEnum = pgEnum('marital_status', ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED']);
export const payTypeEnum = pgEnum('pay_type', ['MONTHLY', 'ANNUAL', 'HOURLY']);

// ---------------------------------------------------------------------------
// Org structure — Settings: Branches, Departments/Sections, Designations
// ---------------------------------------------------------------------------

export const organizationSettings = pgTable('organization_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().unique().references(() => tenants.id),
  name: varchar('name', { length: 200 }),
  logoUrl: text('logo_url'),
  tagline: varchar('tagline', { length: 200 }),
  // Structured address (street/town-city/province/country) — replaces the
  // old single free-text `address` field so it can be rendered as distinct
  // labeled fields and so Country can be a validated dropdown rather than
  // whatever text ended up in a paragraph.
  street: varchar('street', { length: 200 }),
  townCity: varchar('town_city', { length: 120 }),
  province: varchar('province', { length: 120 }),
  country: varchar('country', { length: 120 }),
  // Dictates money formatting across Payroll and employee salary figures —
  // any ISO 4217 code the frontend's currency dropdown offers (see
  // apps/web/src/lib/format.ts). Defaults to Zambia's Kwacha since ZM is now
  // this build's default payroll country.
  currency: varchar('currency', { length: 8 }).notNull().default('ZMW'),
  workingHoursStart: varchar('working_hours_start', { length: 8 }).notNull().default('08:00'),
  workingHoursEnd: varchar('working_hours_end', { length: 8 }).notNull().default('17:00'),
  timezone: varchar('timezone', { length: 60 }).notNull().default('Africa/Lusaka'),
  // Company-side regulatory identifiers — referenced (alongside the matching
  // per-employee identifiers on `employees`) when generating the Regulatory
  // Submission return files on the Payroll page.
  superannuationNo: varchar('superannuation_no', { length: 60 }),
  taxId: varchar('tax_id', { length: 60 }),
  healthInsuranceId: varchar('health_insurance_id', { length: 60 }),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const branches = pgTable(
  'branches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    name: varchar('name', { length: 160 }).notNull(),
    isHeadOffice: integer('is_head_office').notNull().default(0),
    // Same structured shape as organizationSettings above — also what backs
    // the Job tab's "Location" dropdown (rendered as "Town/City, Country").
    street: varchar('street', { length: 200 }),
    townCity: varchar('town_city', { length: 120 }),
    province: varchar('province', { length: 120 }),
    country: varchar('country', { length: 120 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('branches_tenant_idx').on(t.tenantId)],
);

export const departments = pgTable(
  'departments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    name: varchar('name', { length: 160 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('departments_tenant_idx').on(t.tenantId)],
);

export const sections = pgTable(
  'sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    departmentId: uuid('department_id').notNull().references(() => departments.id),
    name: varchar('name', { length: 160 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('sections_tenant_idx').on(t.tenantId), index('sections_department_idx').on(t.departmentId)],
);

export const designations = pgTable(
  'designations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    title: varchar('title', { length: 160 }).notNull(),
    reportsToDesignationId: uuid('reports_to_designation_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('designations_tenant_idx').on(t.tenantId)],
);

// ---------------------------------------------------------------------------
// Module 1 — Employee Profiles
// ---------------------------------------------------------------------------

export const employees = pgTable(
  'employees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    employeeCode: varchar('employee_code', { length: 40 }),
    firstName: varchar('first_name', { length: 120 }).notNull(),
    lastName: varchar('last_name', { length: 120 }).notNull(),
    jobTitle: varchar('job_title', { length: 160 }),
    department: varchar('department', { length: 160 }),
    // Defaults to ZM (Zambia) — this build's default payroll country; NZ
    // remains fully supported and selectable per-employee/per-payroll-run.
    countryCode: varchar('country_code', { length: 2 }).notNull().default('ZM'),
    status: employeeStatusEnum('status').notNull().default('ACTIVE'),
    managerId: uuid('manager_id'),
    annualSalary: doublePrecision('annual_salary'),
    startDate: timestamp('start_date').defaultNow().notNull(),
    customFields: jsonb('custom_fields').notNull().default({}),

    // Structured org links (Settings-managed). jobTitle/department above stay in
    // sync (denormalized) whenever these are set, so existing pages that read the
    // plain text fields keep working unchanged.
    branchId: uuid('branch_id').references(() => branches.id),
    departmentId: uuid('department_id').references(() => departments.id),
    sectionId: uuid('section_id').references(() => sections.id),
    designationId: uuid('designation_id').references(() => designations.id),

    // Work
    sourceOfHire: varchar('source_of_hire', { length: 120 }),
    employmentType: employmentTypeEnum('employment_type').notNull().default('FULL_TIME'),
    workPhone: varchar('work_phone', { length: 40 }),
    location: varchar('location', { length: 160 }),
    // Timesheets is opt-in per employee (v022.A) — an Admin/HR "allocates"
    // it from Settings > Employees, same idea as enabledModules gating a
    // whole tenant but one level down. Off by default: most tenants using
    // this only need it for hourly/casual staff, not everyone. Checked by
    // TimesheetsService.create, not just hidden in the UI.
    timesheetsEnabled: boolean('timesheets_enabled').notNull().default(false),

    // Portrait photo — stored as a data URI (no object storage in this
    // scaffold yet); nullable, falls back to the initials avatar when unset.
    photoUrl: text('photo_url'),

    // Personal details
    email: varchar('personal_email', { length: 255 }),
    mobileNo: varchar('mobile_no', { length: 40 }),
    dateOfBirth: timestamp('date_of_birth'),
    gender: genderEnum('gender'),
    maritalStatus: maritalStatusEnum('marital_status'),
    nationality: varchar('nationality', { length: 120 }),
    bloodGroup: varchar('blood_group', { length: 8 }),
    // ID No (formerly "Driver Licence") — the employee's primary government
    // identification number. Distinct from the org-level `taxId` on
    // organizationSettings; these are the per-employee regulatory
    // identifiers referenced when generating Regulatory Submission return
    // files (PAYE/Superannuation/Health Insurance) on the Payroll page.
    idNo: varchar('id_no', { length: 60 }),
    ssn: varchar('ssn', { length: 60 }),
    nhiId: varchar('nhi_id', { length: 60 }),
    taxId: varchar('tax_id', { length: 60 }),
    hobbies: text('hobbies'),
    fatherName: varchar('father_name', { length: 160 }),
    motherName: varchar('mother_name', { length: 160 }),
    spouseName: varchar('spouse_name', { length: 160 }),
    address1: varchar('address1', { length: 200 }),
    address2: varchar('address2', { length: 200 }),
    city: varchar('city', { length: 120 }),
    state: varchar('state', { length: 120 }),
    country: varchar('country', { length: 120 }),
    zipCode: varchar('zip_code', { length: 20 }),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('employees_tenant_idx').on(t.tenantId), index('employees_tenant_manager_idx').on(t.tenantId, t.managerId)],
);

/** Work Experience — General Info tab. */
export const employeeWorkExperience = pgTable(
  'employee_work_experience',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    employeeId: uuid('employee_id').notNull().references(() => employees.id),
    company: varchar('company', { length: 200 }).notNull(),
    title: varchar('title', { length: 160 }),
    startDate: timestamp('start_date'),
    endDate: timestamp('end_date'),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('employee_work_experience_employee_idx').on(t.employeeId)],
);

/** Education — General Info tab. */
export const employeeEducation = pgTable(
  'employee_education',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    employeeId: uuid('employee_id').notNull().references(() => employees.id),
    institution: varchar('institution', { length: 200 }).notNull(),
    degree: varchar('degree', { length: 160 }),
    fieldOfStudy: varchar('field_of_study', { length: 160 }),
    startDate: timestamp('start_date'),
    endDate: timestamp('end_date'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('employee_education_employee_idx').on(t.employeeId)],
);

/** Dependents — General Info tab. */
export const employeeDependents = pgTable(
  'employee_dependents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    employeeId: uuid('employee_id').notNull().references(() => employees.id),
    name: varchar('name', { length: 160 }).notNull(),
    relationship: varchar('relationship', { length: 80 }),
    dateOfBirth: timestamp('date_of_birth'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('employee_dependents_employee_idx').on(t.employeeId)],
);

export const employeeDocumentCategoryEnum = pgEnum('employee_document_category', ['CONTRACT', 'ID', 'OTHER']);

/** Documents module: Contract Documents, Official ID, and Other Files,
 *  each named by the uploader at upload time. Stored as a data URI (no
 *  object storage in this scaffold yet) — fine for the PDFs/images this is
 *  meant for, viewable inline in the platform. */
export const employeeDocuments = pgTable(
  'employee_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    employeeId: uuid('employee_id').notNull().references(() => employees.id),
    category: employeeDocumentCategoryEnum('category').notNull(),
    label: varchar('label', { length: 200 }).notNull(),
    /** Only set for category OTHER — one of the fixed HR document tags
     *  (Passport, Visa/Work Permit, ... "Other") an Admin/HR uploader picks
     *  at upload time. Null for CONTRACT/ID, and for OTHER documents
     *  self-uploaded by an employee (the tag picker is Admin/HR-only). */
    tag: varchar('tag', { length: 80 }),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    dataUrl: text('data_url').notNull(),
    uploadedById: uuid('uploaded_by_id').references(() => employees.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('employee_documents_employee_idx').on(t.employeeId)],
);

/** Notes — People profile Notes tab. */
export const employeeNotes = pgTable(
  'employee_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    employeeId: uuid('employee_id').notNull().references(() => employees.id),
    authorId: uuid('author_id').references(() => employees.id),
    body: text('body').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('employee_notes_employee_idx').on(t.employeeId)],
);

// --- Job tab: dated, append-only history logs -------------------------------

export const employeeStatusHistory = pgTable(
  'employee_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    employeeId: uuid('employee_id').notNull().references(() => employees.id),
    status: employeeStatusEnum('status').notNull(),
    comment: text('comment'),
    effectiveDate: timestamp('effective_date').defaultNow().notNull(),
    createdById: uuid('created_by_id').references(() => employees.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('employee_status_history_employee_idx').on(t.employeeId)],
);

export const employeeTypeHistory = pgTable(
  'employee_type_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    employeeId: uuid('employee_id').notNull().references(() => employees.id),
    employmentType: employmentTypeEnum('employment_type').notNull(),
    comment: text('comment'),
    effectiveDate: timestamp('effective_date').defaultNow().notNull(),
    createdById: uuid('created_by_id').references(() => employees.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('employee_type_history_employee_idx').on(t.employeeId)],
);

export const employeeCompensationHistory = pgTable(
  'employee_compensation_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    employeeId: uuid('employee_id').notNull().references(() => employees.id),
    // Displayed as "Basic Pay Rate" in the UI — the base figure before
    // allowances, in whatever payType (MONTHLY/ANNUAL/HOURLY) it's quoted.
    payRate: doublePrecision('pay_rate').notNull(),
    payType: payTypeEnum('pay_type').notNull().default('ANNUAL'),
    // The currency this specific historical rate was recorded in — defaults
    // to the Organization's configured currency but is adjustable per entry
    // (e.g. an employee whose pay was renegotiated in a different currency).
    // Payroll's actual run output still formats in the org-wide currency
    // (Settings → Organization); this is a record of what the rate itself
    // was quoted in.
    currency: varchar('currency', { length: 8 }).notNull().default('ZMW'),
    changeReason: varchar('change_reason', { length: 160 }),
    // Repeatable allowance line items (Housing / Transport-Vehicle /
    // Meal-Lunch / Other), each { type, amount, note? } — replaces the old
    // free-form `components` blob now that every native ruleset reads the
    // same shape (Basic Pay Rate + typed allowances) regardless of country.
    allowances: jsonb('allowances').notNull().default([]),
    // Contracted hours/week this rate assumes — null means "full-time
    // standard" (currently 40, see payroll.service.ts's
    // STANDARD_HOURS_PER_WEEK). Recording a new Compensation entry with a
    // different hoursPerWeek (e.g. 40 -> 20 for a move to part-time) is how
    // a working-hours change is captured; payroll's proration engine scales
    // MONTHLY/ANNUAL basic pay by hoursPerWeek/standard and reads it
    // directly as the HOURLY rate's weekly hours.
    hoursPerWeek: doublePrecision('hours_per_week'),
    comment: text('comment'),
    effectiveDate: timestamp('effective_date').defaultNow().notNull(),
    createdById: uuid('created_by_id').references(() => employees.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('employee_compensation_history_employee_idx').on(t.employeeId)],
);

export const employeeJobHistory = pgTable(
  'employee_job_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    employeeId: uuid('employee_id').notNull().references(() => employees.id),
    location: varchar('location', { length: 160 }),
    // FK to the Branch this Job Information entry's Location resolves to;
    // `location` above stays as a denormalized "Town/City, Country" display
    // string kept in sync from the referenced branch.
    locationBranchId: uuid('location_branch_id').references(() => branches.id),
    departmentId: uuid('department_id').references(() => departments.id),
    designationId: uuid('designation_id').references(() => designations.id),
    managerId: uuid('manager_id').references(() => employees.id),
    // v020.A — absorbed from General Info's removed "Work" section, which
    // now lives entirely here on Job Information; every field below is
    // optional (an Admin updating just, say, Reports To on a given entry
    // doesn't have to re-enter these every time) and denormalizes onto the
    // live `employees` row the same way location/department/designation/
    // manager already do.
    sectionId: uuid('section_id').references(() => sections.id),
    sourceOfHire: varchar('source_of_hire', { length: 120 }),
    workPhone: varchar('work_phone', { length: 40 }),
    countryCode: varchar('country_code', { length: 2 }),
    startDate: timestamp('start_date'),
    comment: text('comment'),
    effectiveDate: timestamp('effective_date').defaultNow().notNull(),
    createdById: uuid('created_by_id').references(() => employees.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('employee_job_history_employee_idx').on(t.employeeId)],
);

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export const announcementScopeEnum = pgEnum('announcement_scope', ['ORGANIZATION', 'DEPARTMENT', 'SECTION']);

export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body').notNull(),
    scope: announcementScopeEnum('scope').notNull().default('ORGANIZATION'),
    departmentId: uuid('department_id').references(() => departments.id),
    sectionId: uuid('section_id').references(() => sections.id),
    createdById: uuid('created_by_id').references(() => employees.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('announcements_tenant_idx').on(t.tenantId)],
);

/** Per-employee read receipts, so the dashboard can show an "unread
 *  announcements" count/list. One row per (employee, announcement) once
 *  they've opened it — absence of a row means unread. */
export const announcementReads = pgTable(
  'announcement_reads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    announcementId: uuid('announcement_id').notNull().references(() => announcements.id),
    employeeId: uuid('employee_id').notNull().references(() => employees.id),
    readAt: timestamp('read_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('announcement_reads_announcement_employee_uq').on(t.announcementId, t.employeeId),
    index('announcement_reads_tenant_employee_idx').on(t.tenantId, t.employeeId),
  ],
);

// ---------------------------------------------------------------------------
// Module 2 — Leave & Attendance
// ---------------------------------------------------------------------------

export const leaveRequestStatusEnum = pgEnum('leave_request_status', [
  'PENDING',
  'APPROVED',
  'DECLINED',
  'CANCELLED',
]);

// How often `defaultAnnualDays` days are granted — read together as "N days
// accrued every {DAILY|MONTHLY|ANNUALLY} period" by the accrual engine in
// leave.service.ts. Settings → Leave is where an Admin edits this per
// country regime; see that page and `leave.service.ts`'s
// `computeCycleAnchor`/`periodsElapsed`/`syncLeaveBalances` for the engine.
export const leaveAccrualPeriodEnum = pgEnum('leave_accrual_period', ['DAILY', 'MONTHLY', 'ANNUALLY']);

export const leaveTypes = pgTable(
  'leave_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    name: varchar('name', { length: 120 }).notNull(),
    // A native-payroll country code (ZM, NZ, MW, ZA, ...) or the literal
    // 'OTHER' — a country-less fallback regime an Admin can configure once
    // and have it apply to any employee whose own countryCode has no
    // regime of its own yet. Widened past ISO-2 to fit 'OTHER'.
    countryCode: varchar('country_code', { length: 10 }).notNull().default('ZM'),
    // "Days accrued" per `accrualPeriod` — e.g. 2 + MONTHLY = 2 days credited
    // for every complete month served since the accrual cycle's anchor date.
    defaultAnnualDays: doublePrecision('default_annual_days').notNull().default(0),
    accrualPeriod: leaveAccrualPeriodEnum('accrual_period').notNull().default('ANNUALLY'),
    // Unchecked: the accrual cycle anchors to 1 January of the current year
    // and the balance resets to zero on every 1 January. Checked: the cycle
    // anchors to the employee's own Start Date under Compensation (their
    // earliest Compensation entry's Effective Date, falling back to their
    // People profile Start Date) and balances accumulate indefinitely from
    // there instead of resetting each year.
    carryOverEnabled: boolean('carry_over_enabled').notNull().default(false),
    // Whether an APPROVED request of this type still earns pay. Defaults to
    // true (Annual/Sick leave etc. are paid) — an "Unpaid Leave" type set to
    // false is what payroll's proration engine reads to deduct days from an
    // otherwise-ACTIVE employee's basic pay/allowances for that period.
    isPaid: boolean('is_paid').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('leave_types_tenant_name_country_uq').on(t.tenantId, t.name, t.countryCode),
    index('leave_types_tenant_idx').on(t.tenantId),
  ],
);

export const leaveBalances = pgTable(
  'leave_balances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    employeeId: uuid('employee_id').notNull().references(() => employees.id),
    leaveTypeId: uuid('leave_type_id').notNull().references(() => leaveTypes.id),
    balanceDays: doublePrecision('balance_days').notNull().default(0),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('leave_balances_employee_type_uq').on(t.employeeId, t.leaveTypeId),
    index('leave_balances_tenant_idx').on(t.tenantId),
  ],
);

export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    employeeId: uuid('employee_id').notNull().references(() => employees.id),
    leaveTypeId: uuid('leave_type_id').notNull().references(() => leaveTypes.id),
    startDate: timestamp('start_date').notNull(),
    endDate: timestamp('end_date').notNull(),
    days: doublePrecision('days').notNull(),
    reason: text('reason'),
    status: leaveRequestStatusEnum('status').notNull().default('PENDING'),
    approverId: uuid('approver_id').references(() => employees.id),
    decidedAt: timestamp('decided_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('leave_requests_tenant_idx').on(t.tenantId),
    index('leave_requests_tenant_employee_idx').on(t.tenantId, t.employeeId),
    index('leave_requests_tenant_status_idx').on(t.tenantId, t.status),
  ],
);

// ---------------------------------------------------------------------------
// Module 2b — Timesheets (v022.A)
// ---------------------------------------------------------------------------
//
// Structurally the same shape as leaveRequests just above: an employee
// (who must have timesheetsEnabled — see employees.timesheetsEnabled)
// submits an entry, their supervisor/Admin/HR approves or declines it.
// "Add Weekly Timesheet" on the frontend is just several of these created
// in one call (TimesheetsService.createMany), not a separate table.

export const timesheetStatusEnum = pgEnum('timesheet_status', ['PENDING', 'APPROVED', 'DECLINED']);

export const timesheets = pgTable(
  'timesheets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    employeeId: uuid('employee_id').notNull().references(() => employees.id),
    date: timestamp('date').notNull(),
    // "HH:mm" 24-hour strings (straight out of an <input type="time">) —
    // paired with `date` to compute totalHours server-side. Not a `time`
    // column: keeping them as the exact strings the form collected avoids
    // any timezone-conversion surprise between what was typed and what's
    // displayed back.
    startTime: varchar('start_time', { length: 5 }).notNull(),
    endTime: varchar('end_time', { length: 5 }).notNull(),
    // Array of {start, end} "HH:mm" pairs — usually zero or one entry (a
    // lunch break), but not capped at one.
    breaks: jsonb('breaks').notNull().default([]),
    // (end - start) minus all break durations, in hours — computed once at
    // create/update time (TimesheetsService), not derived on every read.
    totalHours: doublePrecision('total_hours').notNull(),
    workSite: varchar('work_site', { length: 160 }),
    position: varchar('position', { length: 160 }),
    workType: varchar('work_type', { length: 60 }),
    notes: text('notes'),
    status: timesheetStatusEnum('status').notNull().default('PENDING'),
    decidedById: uuid('decided_by_id').references(() => employees.id),
    decidedAt: timestamp('decided_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('timesheets_tenant_idx').on(t.tenantId),
    index('timesheets_tenant_employee_idx').on(t.tenantId, t.employeeId),
    index('timesheets_tenant_status_idx').on(t.tenantId, t.status),
  ],
);

// ---------------------------------------------------------------------------
// Module 3 — Requisitions (skeleton)
// ---------------------------------------------------------------------------

export const requisitionStatusEnum = pgEnum('requisition_status', [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'CLOSED',
]);

export const candidateStageEnum = pgEnum('candidate_stage', [
  'APPLIED',
  'SCREENING',
  'INTERVIEW',
  'OFFER',
  'HIRED',
  'REJECTED',
]);

export const requisitions = pgTable(
  'requisitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    title: varchar('title', { length: 200 }).notNull(),
    department: varchar('department', { length: 160 }),
    headcount: integer('headcount').notNull().default(1),
    budget: doublePrecision('budget'),
    status: requisitionStatusEnum('status').notNull().default('DRAFT'),
    // Nullable (v021.A follow-up) — an ADMIN account created via the
    // platform-admin "Add Tenant" flow has no linked employees row (see the
    // comment on users.employeeId), so it can't always satisfy a NOT NULL FK
    // here. RequisitionsService.apply notifies all tenant Admin/HR logins
    // instead of one hiring manager when this is null.
    requestedById: uuid('requested_by_id').references(() => employees.id),
    approvedById: uuid('approved_by_id').references(() => employees.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    // --- Public careers-page fields --------------------------------------
    // An APPROVED requisition doubles as a live job ad on the tenant's public
    // careers page (/careers/[tenantSlug]) once these are filled in — see
    // CareersService. None of this is exposed until status is APPROVED;
    // the internal-only fields above (budget, requestedById, approvedById)
    // are never selected by the public endpoints regardless.
    employmentType: employmentTypeEnum('employment_type'),
    location: varchar('location', { length: 160 }),
    roleSummary: text('role_summary'),
    whatYoullDo: text('what_youll_do'),
    whatYoullBring: text('what_youll_bring'),
    whatYoullGet: text('what_youll_get'),
    whyUs: text('why_us'),
    // Set when status transitions to APPROVED (see RequisitionsService.approve) —
    // "Date" on the public job list/detail pages.
    publishedAt: timestamp('published_at'),
    // v021.A — raised alongside the requisition-raising form's Employment
    // Type/Location/Department/Date fields. requiredSkills is the job
    // profile's skill list: shown to candidates on the public job page and,
    // more importantly, what the AI ATS (see common/ats/ats.util.ts) scores
    // every applicant against. targetStartDate is a recruiter-set planning
    // date (when they'd like the seat filled), distinct from publishedAt
    // (when the listing went live) — shown on the internal requisitions
    // list, not the public careers page.
    requiredSkills: text('required_skills').array().notNull().default([]),
    targetStartDate: timestamp('target_start_date'),
  },
  (t) => [index('requisitions_tenant_idx').on(t.tenantId)],
);

export const candidates = pgTable(
  'candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    requisitionId: uuid('requisition_id').notNull().references(() => requisitions.id),
    firstName: varchar('first_name', { length: 120 }).notNull(),
    lastName: varchar('last_name', { length: 120 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    stage: candidateStageEnum('stage').notNull().default('APPLIED'),
    // Pre-v021.A field — a free-text resume link, from back when the public
    // apply form had no real file upload. No longer written by new
    // applications (see RequisitionsService.apply) but left in place so old
    // rows don't lose data; superseded by resumeDataUrl below.
    resumeUrl: text('resume_url'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    // --- v021.A — expanded public application form -------------------------
    phone: varchar('phone', { length: 40 }),
    linkedinUrl: text('linkedin_url'),
    expectedSalary: varchar('expected_salary', { length: 120 }),
    noticePeriod: varchar('notice_period', { length: 120 }),
    rightToWork: varchar('right_to_work', { length: 30 }),
    howHeard: varchar('how_heard', { length: 60 }),
    // Repeatable "add more" sections — each an array of small objects; no
    // dedicated tables since these only ever get read back as a unit
    // (candidate detail / ATS scoring), never queried or filtered on
    // individually. Shape documented in ats.util.ts and the ApplyDto.
    education: jsonb('education').notNull().default([]),
    workExperience: jsonb('work_experience').notNull().default([]),
    skills: text('skills').array().notNull().default([]),
    // CV — required on every new application (assertMimeType in the
    // controller); the three columns mirror employeeDocuments' pattern
    // (fileName/mimeType/dataUrl as a base64 data URI, no object storage
    // yet). resumeText is best-effort plain text pulled out of a PDF CV at
    // apply time (see ats.util.ts's extractPdfText) — null if extraction
    // failed or the CV was an image scan; only ever used for ATS matching,
    // never rendered directly (the CV itself is what's shown to a reviewer).
    resumeFileName: varchar('resume_file_name', { length: 255 }),
    resumeMimeType: varchar('resume_mime_type', { length: 100 }),
    resumeDataUrl: text('resume_data_url'),
    resumeText: text('resume_text'),
    // Cover letter — optional; same shape as the CV fields above.
    coverLetterFileName: varchar('cover_letter_file_name', { length: 255 }),
    coverLetterMimeType: varchar('cover_letter_mime_type', { length: 100 }),
    coverLetterDataUrl: text('cover_letter_data_url'),
    coverLetterText: text('cover_letter_text'),
    // AI ATS result, computed once at apply time against the requisition's
    // requiredSkills (see ats.util.ts#scoreCandidate) — 0-100, or null when
    // the requisition had no required skills listed to score against.
    // matchedSkills/missingSkills are the same list split by whether it was
    // found; Application Review ranks candidates by atsScore desc.
    atsScore: integer('ats_score'),
    matchedSkills: text('matched_skills').array().notNull().default([]),
    missingSkills: text('missing_skills').array().notNull().default([]),
  },
  (t) => [index('candidates_tenant_idx').on(t.tenantId)],
);

// ---------------------------------------------------------------------------
// Module 4 — Performance Management (skeleton)
// ---------------------------------------------------------------------------

export const goalStatusEnum = pgEnum('goal_status', ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']);
export const reviewCycleStatusEnum = pgEnum('review_cycle_status', ['UPCOMING', 'OPEN', 'CLOSED']);
export const reviewStatusEnum = pgEnum('review_status', ['PENDING', 'SUBMITTED']);

export const goals = pgTable(
  'goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    employeeId: uuid('employee_id').notNull().references(() => employees.id),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    status: goalStatusEnum('status').notNull().default('NOT_STARTED'),
    dueDate: timestamp('due_date'),
    // "Performance Goals" table on the People profile (People > Performance tab)
    supervisorId: uuid('supervisor_id').references(() => employees.id),
    employeeAssessment: varchar('employee_assessment', { length: 160 }),
    supervisorAssessment: varchar('supervisor_assessment', { length: 160 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('goals_tenant_idx').on(t.tenantId)],
);

/** Ad-hoc scored review — "Performance Reviews" table on the People profile. */
export const performanceReviewEntries = pgTable(
  'performance_review_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    employeeId: uuid('employee_id').notNull().references(() => employees.id),
    reviewerId: uuid('reviewer_id').references(() => employees.id),
    jobKnowledge: integer('job_knowledge'),
    workQuality: integer('work_quality'),
    attendance: integer('attendance'),
    communication: integer('communication'),
    dependability: integer('dependability'),
    date: timestamp('date').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('performance_review_entries_employee_idx').on(t.employeeId)],
);

/** Free-text comments — "Performance Comments" table on the People profile. */
export const performanceComments = pgTable(
  'performance_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    employeeId: uuid('employee_id').notNull().references(() => employees.id),
    reviewerId: uuid('reviewer_id').references(() => employees.id),
    comment: text('comment').notNull(),
    date: timestamp('date').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('performance_comments_employee_idx').on(t.employeeId)],
);

export const reviewCycles = pgTable(
  'review_cycles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    name: varchar('name', { length: 160 }).notNull(),
    startDate: timestamp('start_date').notNull(),
    endDate: timestamp('end_date').notNull(),
    status: reviewCycleStatusEnum('status').notNull().default('UPCOMING'),
  },
  (t) => [index('review_cycles_tenant_idx').on(t.tenantId)],
);

export const performanceReviews = pgTable(
  'performance_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    cycleId: uuid('cycle_id').notNull().references(() => reviewCycles.id),
    employeeId: uuid('employee_id').notNull().references(() => employees.id),
    reviewerId: uuid('reviewer_id').notNull().references(() => employees.id),
    rating: integer('rating'),
    comments: text('comments'),
    status: reviewStatusEnum('status').notNull().default('PENDING'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('performance_reviews_tenant_idx').on(t.tenantId)],
);

// ---------------------------------------------------------------------------
// Module 5 — Payroll (ZM is the default native ruleset; NZ is implemented
// alongside it as a second native pattern example and stays selectable on
// every payroll run)
// ---------------------------------------------------------------------------

export const payRunStatusEnum = pgEnum('pay_run_status', ['DRAFT', 'APPROVED', 'PAID']);
export const payrollAdjustmentTypeEnum = pgEnum('payroll_adjustment_type', ['ADDITION', 'DEDUCTION']);
export const payrollAdjustmentStatusEnum = pgEnum('payroll_adjustment_status', ['PENDING', 'COMPLETED', 'CANCELLED']);

export const payRuns = pgTable(
  'pay_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    countryCode: varchar('country_code', { length: 2 }).notNull(),
    status: payRunStatusEnum('status').notNull().default('DRAFT'),
    approvedById: uuid('approved_by_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('pay_runs_tenant_idx').on(t.tenantId)],
);

export const payslips = pgTable(
  'payslips',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    payRunId: uuid('pay_run_id').notNull().references(() => payRuns.id),
    employeeId: uuid('employee_id').notNull().references(() => employees.id),
    grossPay: doublePrecision('gross_pay').notNull(),
    tax: doublePrecision('tax').notNull(),
    deductions: doublePrecision('deductions').notNull().default(0),
    netPay: doublePrecision('net_pay').notNull(),
    // Ruleset-specific breakdown for payslip display (e.g. ZM's earnings
    // split — Basic/Housing/Transport/Lunch — plus PAYE/NAPSA/NHI lines).
    // Empty object for rulesets (like NZ) that don't populate it.
    components: jsonb('components').notNull().default({}),
    // Snapshot of the ad-hoc additions/deductions (advances, bonuses, etc.
    // from `payroll_adjustments`) applied to this specific payslip, so the
    // payslip keeps showing them even if the adjustment itself later
    // completes/cancels. Array of { label, type, amount }.
    adjustments: jsonb('adjustments').notNull().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('payslips_tenant_idx').on(t.tenantId)],
);

/** Ad-hoc additions/deductions an Admin schedules onto an employee's future
 *  payroll runs — a bonus paid once, or an advance clawed back over several
 *  runs. Each run's payroll pass finds PENDING rows for an eligible employee,
 *  applies one occurrence, and marks the row COMPLETED once `appliedCount`
 *  reaches `occurrences`. An Admin can CANCEL a still-PENDING row before it's
 *  fully applied. */
export const payrollAdjustments = pgTable(
  'payroll_adjustments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    employeeId: uuid('employee_id').notNull().references(() => employees.id),
    type: payrollAdjustmentTypeEnum('type').notNull(),
    label: varchar('label', { length: 160 }).notNull(),
    amount: doublePrecision('amount').notNull(),
    // How many pay runs this should be applied over (1 = a one-off bonus or
    // single deduction; >1 = e.g. an advance clawed back over 3 runs).
    occurrences: integer('occurrences').notNull().default(1),
    appliedCount: integer('applied_count').notNull().default(0),
    status: payrollAdjustmentStatusEnum('status').notNull().default('PENDING'),
    createdById: uuid('created_by_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('payroll_adjustments_tenant_idx').on(t.tenantId),
    index('payroll_adjustments_tenant_employee_idx').on(t.tenantId, t.employeeId),
  ],
);

export const taxProfiles = pgTable(
  'tax_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    employeeId: uuid('employee_id').notNull().references(() => employees.id),
    countryCode: varchar('country_code', { length: 2 }).notNull(),
    taxCode: varchar('tax_code', { length: 20 }),
    kiwiSaverRate: doublePrecision('kiwisaver_rate'),
    version: integer('version').notNull().default(1),
    effectiveFrom: timestamp('effective_from').defaultNow().notNull(),
  },
  (t) => [index('tax_profiles_tenant_idx').on(t.tenantId), index('tax_profiles_tenant_employee_idx').on(t.tenantId, t.employeeId)],
);

// ---------------------------------------------------------------------------
// Training / Courses (LMS)
// ---------------------------------------------------------------------------

export const courseAssignmentStatusEnum = pgEnum('course_assignment_status', ['PENDING', 'STARTED', 'COMPLETED']);

/** A course as configured under Settings -> Training. Unpublished courses
 *  are draft-only (Admin can still see/edit them); publishing is what makes
 *  a course selectable in the "Assign Courses" picker Supervisors/Admins
 *  use to allocate it to staff. */
export const courses = pgTable(
  'courses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    title: varchar('title', { length: 200 }).notNull(),
    // Course thumbnail — a data URI, same no-object-storage-yet pattern as
    // logos/portraits/documents elsewhere in this scaffold.
    imageUrl: text('image_url'),
    // The course video/resource link. Rendered as an embedded YouTube
    // player when it matches a recognizable YouTube URL shape; otherwise
    // "My Courses" falls back to a plain "Open course" link.
    courseUrl: varchar('course_url', { length: 500 }).notNull(),
    published: boolean('published').notNull().default(false),
    createdById: uuid('created_by_id').references(() => employees.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('courses_tenant_idx').on(t.tenantId)],
);

/** One MCQ question belonging to a course's quiz. */
export const courseQuizQuestions = pgTable(
  'course_quiz_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    courseId: uuid('course_id').notNull().references(() => courses.id),
    question: text('question').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('course_quiz_questions_course_idx').on(t.courseId)],
);

/** One multiple-choice option for a quiz question. Exactly one option per
 *  question is expected to carry `isCorrect: true`, enforced in
 *  TrainingService rather than at the DB layer (keeps quiz authoring a
 *  plain "replace this course's quiz" operation). `isCorrect` is never
 *  sent to an employee taking the quiz — only to whoever is authoring it,
 *  and used server-side to grade a submission. */
export const courseQuizOptions = pgTable(
  'course_quiz_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    questionId: uuid('question_id').notNull().references(() => courseQuizQuestions.id),
    optionText: varchar('option_text', { length: 300 }).notNull(),
    isCorrect: boolean('is_correct').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('course_quiz_options_question_idx').on(t.questionId)],
);

/** One course allocated to one employee, by a Supervisor or Admin via
 *  "Assign Courses". Status starts PENDING, flips to STARTED the first
 *  time the employee opens the course player, and to COMPLETED either on
 *  quiz submission (score recorded) or a manual "Mark complete" for a
 *  course with no quiz. */
export const courseAssignments = pgTable(
  'course_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    courseId: uuid('course_id').notNull().references(() => courses.id),
    employeeId: uuid('employee_id').notNull().references(() => employees.id),
    assignedById: uuid('assigned_by_id').references(() => employees.id),
    status: courseAssignmentStatusEnum('status').notNull().default('PENDING'),
    scorePercent: doublePrecision('score_percent'),
    assignedAt: timestamp('assigned_at').defaultNow().notNull(),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
  },
  (t) => [
    index('course_assignments_employee_idx').on(t.employeeId),
    index('course_assignments_course_idx').on(t.courseId),
    uniqueIndex('course_assignments_course_employee_uq').on(t.courseId, t.employeeId),
  ],
);

// ---------------------------------------------------------------------------
// Relations (for Drizzle's relational query API)
// ---------------------------------------------------------------------------

export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  employees: many(employees),
}));

export const usersRelations = relations(users, ({ one }) => ({
  tenant: one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
  employee: one(employees, { fields: [users.employeeId], references: [employees.id] }),
  candidate: one(candidates, { fields: [users.candidateId], references: [candidates.id] }),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  tenant: one(tenants, { fields: [employees.tenantId], references: [tenants.id] }),
  manager: one(employees, { fields: [employees.managerId], references: [employees.id] }),
  leaveBalances: many(leaveBalances),
  leaveRequests: many(leaveRequests),
}));

export const leaveTypesRelations = relations(leaveTypes, ({ many }) => ({
  balances: many(leaveBalances),
  requests: many(leaveRequests),
}));

export const leaveBalancesRelations = relations(leaveBalances, ({ one }) => ({
  employee: one(employees, { fields: [leaveBalances.employeeId], references: [employees.id] }),
  leaveType: one(leaveTypes, { fields: [leaveBalances.leaveTypeId], references: [leaveTypes.id] }),
}));

export const leaveRequestsRelations = relations(leaveRequests, ({ one }) => ({
  employee: one(employees, { fields: [leaveRequests.employeeId], references: [employees.id] }),
  leaveType: one(leaveTypes, { fields: [leaveRequests.leaveTypeId], references: [leaveTypes.id] }),
  approver: one(employees, { fields: [leaveRequests.approverId], references: [employees.id] }),
}));

export const requisitionsRelations = relations(requisitions, ({ many }) => ({
  candidates: many(candidates),
}));

export const candidatesRelations = relations(candidates, ({ one }) => ({
  requisition: one(requisitions, { fields: [candidates.requisitionId], references: [requisitions.id] }),
}));

export const coursesRelations = relations(courses, ({ many }) => ({
  quizQuestions: many(courseQuizQuestions),
  assignments: many(courseAssignments),
}));

export const courseQuizQuestionsRelations = relations(courseQuizQuestions, ({ one, many }) => ({
  course: one(courses, { fields: [courseQuizQuestions.courseId], references: [courses.id] }),
  options: many(courseQuizOptions),
}));

export const courseQuizOptionsRelations = relations(courseQuizOptions, ({ one }) => ({
  question: one(courseQuizQuestions, { fields: [courseQuizOptions.questionId], references: [courseQuizQuestions.id] }),
}));

export const courseAssignmentsRelations = relations(courseAssignments, ({ one }) => ({
  course: one(courses, { fields: [courseAssignments.courseId], references: [courses.id] }),
  employee: one(employees, { fields: [courseAssignments.employeeId], references: [employees.id] }),
  assignedBy: one(employees, { fields: [courseAssignments.assignedById], references: [employees.id] }),
}));
