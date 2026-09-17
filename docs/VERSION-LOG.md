# tmPro — Version Log

Versioning scheme: `vNNN.X` — the number (`001`, `002`, ...) marks a major
build/functional milestone; the letter (`A`, `B`, ...) marks a revision within that
milestone (redesigns, look-and-feel passes, bug-fix rounds) that doesn't change the
underlying functional scope.

## v001.A — 2026-09-10

Initial working scaffold. Git tag: `v001.A` (commit `30a2fed`).

**Functional scope (Phase 0/Phase 1 of `tmpro-build-framework.md`):**
- Multi-tenant architecture: shared schema + `tenantId` on every table, enforced at
  the application layer and via Postgres Row-Level Security.
- Auth: JWT, role-based access control (Employee / Supervisor / Admin), seeded demo
  tenant `riverbird-demo` with three demo logins.
- Employee Profiles + Leave & Attendance: working end-to-end (request → approve →
  balance update).
- Requisitions + candidate apply flow: scaffolded, working (public `/careers` page).
- Performance Management: goals working; review cycles modeled but not wired up.
- Payroll: working end-to-end for NZ (native `PayrollRuleset`); every other country
  returns a clean "not yet supported, needs a partner integration" error by design.

**Stack:** NestJS + Drizzle ORM + PostgreSQL (backend), Next.js + React + Tailwind
(frontend). (Originally speced with Prisma; swapped to Drizzle mid-build because
Prisma's engine-binary download was blocked by the build environment's network
policy — no functional difference to the app.)

**Look & feel:** default/unstyled Tailwind primitives — functional, not designed.
This is the known gap v002 and later versions are expected to address.

**Verified:** logged in and used successfully by the user on their own machine
(local Postgres, no Docker).

---

## v002.A — 2026-09-11

First visual/UX redesign pass. No functional changes — same modules, same API, same
data model as v001.A. Direction from the user: brand around the tmPro logo (icon +
"tm|Pro" wordmark), tagline **"your talent.unified"**, big logo + tagline on the login
screen and a small logo once logged in, and a reference dashboard style (purple/lavender
sidebar shell, white rounded cards, avatar bubbles for people) to model the in-app look on.

**What changed:**
- New brand palette in `apps/web/tailwind.config.ts` (`brand.*` — cyan/blue/violet/
  magenta/orange, sampled from the logo) and two new background gradients
  (`brand-gradient` for the login screen, `sidebar-gradient` for the app chrome).
- `apps/web/public/logo-full.png` (login-screen lockup) and `logo-icon.png` (compact
  mark) — cropped from the logo the user supplied.
- App shell rebuilt from a plain top nav into a left sidebar (`components/app-shell.tsx`)
  using the sidebar gradient, with a small logo at top and the signed-in user's avatar +
  logout at the bottom; a slim top bar shows the org name and avatar.
- `components/avatar.tsx` — initials-based circular avatars, deterministically colored
  per person from the brand palette (no photo-upload infra yet — this is the placeholder
  until real profile photos exist). Wired into the sidebar, the dashboard header, and the
  team-approvals list.
- `components/logo.tsx`, `components/icons.tsx` — logo lockup variants and a small set of
  hand-rolled nav icons (no icon-library dependency added).
- Login screen rebuilt around `LogoHero` (big logo + tagline) on a soft brand-gradient
  background; careers (candidate) page gets a small branded header bar.
- `card`/`btn-primary`/`input` primitives in `globals.css` updated to rounded-2xl cards
  with a soft shadow and a blue→violet gradient primary button, in place of the flat
  v001.A styling.

**Not yet done:** photo-upload avatars (still initials), payroll/performance/requisitions
pages beyond inheriting the new card style (no page-specific redesign), dark mode.

**Verified:** `npm run build` clean; visually smoke-tested (login, dashboard, payroll,
careers) via Playwright screenshots against the live dev servers.

---

## v003.A — 2026-09-11

New functional milestone (not just a look-and-feel revision — adds a real module and
new API surface): a **People directory**, plus a sidebar restructure the user asked for
after seeing v002.A, modeled on a reference HR product's nav and employee-profile layout.

**Sidebar nav is now:** Dashboard, People (Admin only), Leave, Performance, Recruitment
(renamed from Requisitions), Payroll, Training, Documents, Reports (Admin/Supervisor
only). Training, Documents and Reports are stub pages — no backend yet, clearly labeled
as not built.

**New — People module:**
- `GET /people` directory page (Admin only): searchable table of every employee
  (avatar, job title, department, status, hire date), backed by the existing
  `GET /employees` endpoint.
- `/people/:id` profile page (Admin + Supervisor) with tabs — General Info, Job, Leave,
  Notes, Performance, Permission — modeled on the reference screenshots the user shared.
  General Info and Job are editable (name, title, department, manager, status, and —
  Admin only — salary) via the existing `PATCH /employees/:id`. Leave and Performance
  pull that person's real balances/requests/goals through two new read-only endpoints:
  `GET /leave/balances/employee/:id`, `GET /leave/requests/employee/:id` (Admin/
  Supervisor), and `GET /performance/goals/employee/:id` (Admin/Supervisor). Notes isn't
  built (stub tab); Permission is read-only (shows the linked account's email/role, no
  editing yet).
- `employees.service.findDetail()` now also returns the manager and linked login
  account in one call for the profile page.

**Restructured:** the leave request form, balance cards, own-requests list, and
supervisor team-approvals that used to live on Dashboard moved to their own `/leave`
page. Dashboard is now a lighter overview (profile card, balance summary, role-specific
quick links).

**Not yet done:** Training, Documents, Reports have no backend; People directory is
Admin-only (Supervisors can open a profile by ID but not browse the list); Notes tab;
role editing on the Permission tab.

**Verified:** `npm run build` and `npm run typecheck` clean on both apps; visually
smoke-tested (admin People list → profile → Job/Leave tabs, employee Dashboard/Leave)
via Playwright against the live dev servers, using real seeded data throughout.

---

## v004.A — 2026-09-12

New functional milestone: **People visibility scoping** across all three roles, and a
full **Settings module** (Admin-only) for defining the org structure — the two smaller
of the three instructions the user issued after v003.A. (The third — rebuilding the
People profile tabs field-for-field against the reference screenshots, with Admin
add/edit everywhere — is the next milestone; see "Not yet done" below.)

**People visibility (was Admin-only):**
- The People sidebar link is now visible to every role. `GET /employees` is
  role-scoped server-side instead of being an Admin-only route:
  `EmployeesService.findVisible()` returns the full directory for Admin, the
  caller's direct reports plus themselves for Supervisor, and just their own record
  for Employee. `GET /employees/:id` enforces the same scoping (403 if a Supervisor
  or Employee requests someone outside what they can see).
- The People list and profile pages no longer duplicate this logic client-side — they
  render whatever the API returns and surface a 403 as a normal error. Edit affordances
  on the profile (General Info, Job) are now gated to Admin in the UI, matching what
  `PATCH /employees/:id` already enforced server-side.

**New — Settings module (Admin only), backing instruction #3:**
- Schema: `organization_settings`, `branches`, `departments`, `sections`,
  `designations` (with a self-referencing `reports_to_designation_id`),
  `announcements`; `employees` gained structured FK columns (`branchId`,
  `departmentId`, `sectionId`, `designationId`, `employeeCode`, `employmentType`,
  `sourceOfHire`, `workPhone`) alongside its existing free-text `department`/
  `jobTitle`, which stay denormalized/in sync whenever the structured fields are set.
  Also added (schema only, not yet wired to any endpoint — see Not yet done):
  `employee_work_experience`, `employee_education`, `employee_dependents`,
  `employee_notes`, and dated history-log tables for status/employment-type/
  compensation/job-info changes, plus `performance_review_entries` and
  `performance_comments`.
- `/settings/organization` (get/update — single row per tenant, upserted),
  `/settings/branches`, `/settings/departments`, `/settings/sections` (nested under
  a department), `/settings/designations` (with reports-to), `/settings/announcements`
  (scoped to Organization/Department/Section — `GET /announcements/me` is the
  non-Admin read every dashboard can call) — full CRUD, all Admin-only except the
  `/me` feed.
- **Data Import (CSV)** on every tab that creates records: Branches, Departments,
  Sections, Designations, and Employees (`POST /employees/import`) — each parses via
  a shared `csv-parse`-based utility, imports row-by-row so one bad row doesn't fail
  the batch, and returns `{ imported, skipped, errors }`.
- Settings frontend: a new Admin-only `/settings` section with the 7 tabs the user
  specified (Organization, Branches, Departments, Employees, Designations,
  Announcements, Org Chart). Org Chart is a real recursive tree built from
  `managerId` reporting lines (expand/collapse per node) — simpler box-and-line
  styling than the reference image, not yet photo-avatar/department-band styled.
  Employees tab creates employees with the new structured fields (branch, department,
  section, designation, reports-to, employment type) and links each row into the
  existing People profile page.

**Not yet done (instruction #1 — next milestone):** the People profile's General Info,
Job, Performance, and Leave tabs still show the v003.A field set, not the fuller one
from the reference screenshots (Employee ID, Source of Hire, Personal Details block,
Work Experience/Education/Dependents, Job as dated history logs, Performance
Reviews/Comments/Goals with assessments, Leave with year/status/policy filters). The
schema for most of this already exists (see above) but no service/controller/UI wires
it up yet.

**Verified:** `npm run build` and `npm run typecheck` clean on both apps. Backend
smoke-tested directly (login as each of the 3 demo roles, confirmed People-list scoping,
403s on out-of-scope profile access, Settings 403 for non-Admin, a live CSV import against
`/settings/branches/import`). Frontend smoke-tested via Playwright screenshots across all
three roles and all 7 Settings tabs against the live dev servers.

---

## v005.A — 2026-09-12

People profile rebuild — the last of the three instructions the user issued after
v003.A. The General Info, Job, Performance, and Leave tabs are now field-complete
against the reference spec, and every field on them is Admin-editable.

**Backend — new sub-resource and history endpoints under `/employees/:employeeId/...`:**
- `work-experience`, `education`, `dependents` (list + Admin add/delete) —
  `EmployeeDetailsService`/`EmployeeDetailsController`.
- `history/status`, `history/employment-type`, `history/compensation`,
  `history/job-info` (list + Admin add) — `EmployeeHistoryService`/
  `EmployeeHistoryController`. Each "add" both appends a new row to its own
  append-only log table and pushes the same value onto the live `employees` record
  (reusing `EmployeesService.update()`, including its department/jobTitle
  denormalization), so General Info's Work section always reflects the latest Job-tab
  entry without a second read. Added `location` to `UpdateEmployeeDto` to carry this
  through cleanly (previously papered over with a type cast).
- `performance/reviews`, `performance/comments`, `performance/goals` (list + Admin
  add; goals also support Admin PATCH) — `EmployeePerformanceService`/
  `EmployeePerformanceController`. Distinct from the existing self-service
  `/performance/goals/me` routes an employee uses to manage their own goals.
- All of the above follow the same visibility rule as the profile itself (read:
  Admin/Supervisor-for-their-team/Employee-for-self via `assertVisible()`; write:
  Admin only), consistent with every other People-profile endpoint.
- `UpdateEmployeeDto` now exposes every Personal Details field flattened directly as
  a decorated class property (no interface-merging trick — those are silently
  stripped by `ValidationPipe({ whitelist: true })` since only real class-validator
  metadata survives it).

**Frontend — full rebuild of `/people/[id]`, split into per-tab modules:**
- `general-info-tab.tsx`: three independently-editable cards (Basic Info, Work,
  Personal Details) matching the full field set, plus three addable/deletable lists
  (Work Experience, Education, Dependents).
- `job-tab.tsx`: the four dated history logs (Employee Status, Employment Type,
  Compensation, Job Information), each an append-only list with an Admin "+ Update"
  form; adding an entry refreshes the profile header/Work section too.
- `performance-tab.tsx`: Reviews (5-category 1–5 ratings), Comments, and Goals
  (with supervisor, status, and both employee/supervisor assessments) — goals
  support inline Admin edit, not just add.
- `leave-tab.tsx`: Year / Status / Policy filters over the employee's leave requests,
  above the existing balances summary.
- Shared plumbing in `shared.tsx` (a generic `AddableList` used by all of the above
  list-with-add-form sections, plus `useOrgOptions()` to fetch branches/departments/
  sections/designations/employees once per profile view) and `types.ts`.

**Verified:** `npm run build` and `npm run typecheck` clean on both apps. Playwright
smoke test as Admin: edited Basic Info/Work/Personal Details, added a work-experience
entry, an education entry, and a dependent; updated Employee Status and Compensation
on the Job tab (confirmed the header and Work-section start date/salary picked up the
new value); added a Performance goal and confirmed it listed with an Edit control;
exercised the Leave tab's Year/Status/Policy filters. Repeated as a non-Admin Employee
login and confirmed zero Edit/Add/Update controls render (server-side authorization
already covered by `assertVisible`/`@Roles('ADMIN')` — this just confirms the UI gates
match). No console or page errors in either pass.

---

## v006.A — 2026-09-12

A batch of seven user-requested enhancements collected up front, then executed
together: reference-data dropdowns, portrait/logo uploads, sample CSV templates, a
Documents module, a native Zambia payroll ruleset, and a downloadable org chart PDF.

**1. Dropdowns for globally-known fields** — `apps/web/src/lib/reference-data.ts`
(new): `BLOOD_GROUPS`, `COUNTRIES` (~140 countries, each with an ISO 3166-1 alpha-2
`code`, `name`, and `nationality` demonym so Country/Nationality/Country-code fields
share one source list), and `getTimezones()` (runtime `Intl.supportedValuesOf`, with
a static fallback for unsupported browsers). Wired into: Settings → Organization
(Timezone), Settings → Employees creation form (Country), and the People profile's
General Info tab (Nationality, Blood group in Basic Info; Country in Work; address
Country in Personal Details) — all previously free-text inputs.

**2. Employee portrait upload** — `employees.photoUrl` (new column, stored as a data
URI — no object storage in this scaffold), `POST /employees/:id/photo` (Admin-only,
3 MB cap, image mimetypes only). `Avatar` now accepts an optional `photoUrl` and
renders it in place of the initials bubble; wired into the People profile's Basic
Info card (with the upload control), the People directory, the profile header,
Settings → Employees, and the app shell header for the signed-in user.

**3. Organization logo + branded header** — `POST /settings/organization/logo`
(image upload → `organizationSettings.logoUrl`, already existed as a column). New
`GET /settings/organization-branding` — open to every signed-in role (unlike the
rest of the Admin-only Settings module) — since the app-shell header needs it for
every user, not just Admins. The header (`app-shell.tsx`) now shows the logo image
next to the organization's name in bold, with a fixed "Talent Management Portal"
tagline underneath, replacing the plain tenant-name text. Settings → Organization's
"Logo URL" text field became a real upload control.

**4. Downloadable sample CSVs** — `CsvImportButton` (used by Branches, Departments,
Sections, Designations, Employees) takes an optional `sampleColumns` prop; when set,
a "Sample CSV" link sits next to the import button and generates a one-row template
client-side (no backend round-trip) with the exact headers each import parser
expects, taken directly from the `importXxx()` service methods' documented columns.

**5. Documents module** — new `employee_documents` table (category enum
`CONTRACT`/`ID`/`OTHER`, `label`, `fileName`, `mimeType`, `dataUrl`) and
`EmployeeDocumentsService`/`Controller` under `/employees/:employeeId/documents`.
Deliberately diverges from the profile's Admin-only write rule: upload/delete is
allowed for Admin **or** the employee managing their own documents, since ID/
Contract uploads are normally self-service. New "Documents" tab on the People
profile (`documents-tab.tsx`) with three fixed upload slots — Contract Documents
(PDF only), Official ID, Other Files (PDF or image) — each file named by the
uploader at upload time and viewable inline (PDF via `<iframe>`, images directly) in
a modal, no download required. `/documents` (sidebar "Documents") is no longer a
stub — it's the same component self-scoped to the signed-in user's own employee
record, with a fallback message for accounts with no linked employee.

**6. Native Zambia (ZM) payroll ruleset** — `zm-payroll-ruleset.ts`, registered in
`PAYROLL_RULESETS` alongside NZ. Reverse-engineered from the employer's reference
PAYE calculator and pay-advice template: Gross/Taxable Pay = Basic Salary + Housing
+ Transport + Lunch Allowance; monthly PAYE bands (0% to K5,100, 20% to K7,100, 30%
to K9,200, 37% above); NAPSA = 5% × min(gross, K26,840 ceiling); National Health
Insurance = 1% of Basic Pay only. Verified arithmetically end-to-end against the
supplied worked example (Gross K43,240 → PAYE K13,624.80, NAPSA K1,342.00, NHI
K202.40 → Net K28,070.80) via a live payroll run — exact match. The earnings split
is captured as a new `components` JSONB column on `employee_compensation_history`
(Job tab's Compensation card grows four extra fields — Basic/Housing/Transport/
Lunch — when the employee's country is ZM, computing the pay rate as their sum) and
carried onto the resulting payslip (new `components` JSONB column on `payslips`) so
the Payroll page can render the full "PAY ADVICE" layout — earnings breakdown,
statutory deductions, highlighted net pay, payroll reference footer — matching the
supplied design, instead of the plain Gross/Tax/Deductions/Net grid NZ still uses.

**7. Org Chart PDF export** — "Download PDF" button on Settings → Org Chart, using
`html2canvas` + `jsPDF` (both newly added to `apps/web`) to snapshot the rendered
tree and embed it as a single image on a landscape page sized to the chart's own
aspect ratio, so nothing is cropped regardless of team size/shape.

**Verified:** `npm run build` and `npm run typecheck` clean on both apps. Playwright
smoke test as Admin covering: Settings → Organization (timezone dropdown, logo
upload control), the app-shell header (bold org name + tagline render correctly),
People directory + profile (Documents tab shows all three upload slots), Settings →
Employees (Country dropdown, sample-CSV link), Org Chart (PDF button present), and
Payroll (ZM option present). Separately, a full API-level ZM payroll run (new
employee → compensation with components → run payroll) reproduced the worked
example's figures exactly, and the resulting payslip rendered in the browser
matches the supplied Pay Advice design pixel-for-pixel in structure.

## v007.A — 2026-09-12

Also includes the `2d3e209` `PayloadTooLargeError` fix (Express body-parser limit,
Organization save no longer resending the logo data URI) already shipped between
v006.A and this version. Six items:

**1. Organization currency drives all money display.** `GET
/settings/organization-branding` (already open to every role, unlike the rest of
Settings) now also returns `currency`. New `formatMoney(amount, currencyCode)`
helper (`apps/web/src/lib/format.ts`) replaces Payroll's old `money()`, which had
been guessing a `$`/`K` prefix off the pay run's `countryCode` — money everywhere
in Payroll (stat grid and the ZM Pay Advice layout, including its "Currency" line,
previously a hardcoded `"ZMW"` literal) now formats using the Organization's
`currency` setting instead, regardless of which country's ruleset produced the
figures. Verified live: setting Organization → Currency to `ZMW` changed an
already-approved **NZ** pay run's payslips to `K` formatting immediately.

**2. Employee payslip self-service** — already fully built as of v006.A
(`GET /payroll/payslips/me`, the non-Admin branch of the Payroll page); no
code change needed, confirmed working as part of this batch's verification.

**3. Admin & Supervisor dashboard summaries.** New `dashboard` module
(`GET /dashboard/admin-summary`, `GET /dashboard/supervisor-summary`). Admin:
headcount, department count, and pending-request count (leave + requisitions) as
three large "teardrop" stat tiles (new `<TeardropStat>` component — a circle with
one corner squared and rotated 45°, brand-gradient fill, counter-rotated text) in
the theme's cyan/violet/orange gradients, plus panel lists for staff away-on/
about-to-go-on leave (next 7 days), pending requests, and upcoming birthdays
(30-day window — the spec only fixed a window for Supervisor's "next week", so a
wider default was used org-wide to avoid a mostly-empty admin panel). Supervisor:
the same shape scoped to direct reports only (direct-report count, team pending
requests, team on/about-to-go-on leave, team birthdays in the next 7 days exactly
as specified), alongside their own existing leave-balance cards.

**4. Reports page — six report types, all with a date-range filter.** New
`reports` module, one endpoint per report (`GET /reports/leave-accumulated`,
`/goals-set`, `/appraisals-conducted`, `/unresponded-requests` [Admin-only — it's
an org-wide breakdown by supervisor, not a per-employee list], `/contracts-missing`,
`/ids-missing`), each accepting optional `from`/`to` query params. Design notes:
"leave days accumulated" is read as days taken within the range (sum of approved
requests' `days` where `startDate` falls in range) alongside each person's current
balance, since the schema has no separate accrual figure; "appraisals conducted"
reads from `performance_review_entries` (the People-profile "Performance Reviews"
table) since the schema's formal review-cycle tables aren't wired up anywhere in
this build; "contracts/IDs not on file" filters by employee hire date (`startDate`)
since document absence has no date of its own to range over. Every report
Admin-scopes to the whole tenant and Supervisor-scopes to direct reports only
(matching the visibility rule used everywhere else in the app), except
unresponded-requests-by-supervisor which is Admin-only. Frontend: report picker +
From/To date inputs + Run button + results table, all on the previously-stub
`/reports` page.

**5. Employee dashboard** — enhanced leave-balance cards now show "N of M days
taken" (derived from the already-fetched `leaveType.defaultAnnualDays` vs.
`balanceDays`, no backend change needed) alongside the existing remaining-balance
figure; new "Unread announcements" card (count + brief clickable list — clicking
marks read) and "Unapproved requests" card (count + brief list of the employee's
own `PENDING` leave requests, from the already-existing `/leave/requests/me`).
Announcements gained read-tracking to support this: new `announcement_reads` table
(one row per employee/announcement once opened), `GET /announcements/me` now
returns a `read` flag per item via a left-join-style lookup, and
`POST /announcements/:id/read` marks one read (idempotent).

**6. Dashboard avatar bug fix** — the dashboard's `Employee` interface never
declared `photoUrl`, so an uploaded portrait never reached the header `<Avatar>`
even though `/employees/me` already returned it — every employee showed their
initials circle regardless of an uploaded photo. Fixed by adding `photoUrl` to the
interface and passing it through; verified live by uploading a test photo for the
demo Employee account and confirming the dashboard immediately rendered it in
place of initials.

**Verified:** `npm run typecheck` and `npm run build` clean on both apps.
Playwright smoke tests covering: Admin/Supervisor/Employee dashboards (teardrop
stats, panel lists, avatar photo, leave taken/total, unread announcements,
unapproved requests) with screenshots; all six Reports run without error as both
Admin and Supervisor; an end-to-end announcement flow (Admin posts → Employee sees
it unread → clicks to mark read → survives a page reload, confirming the backend
write, not just optimistic UI state); the currency-follows-Organization-setting
behavior described in item 1. Also caught and fixed, during verification, a
`Promise.all()` over multiple queries sharing one `withTenant()` transaction's
client connection in four new service methods (dashboard admin summary, three
Reports queries) — node-postgres doesn't support concurrent queries on one
connection (it emitted a `DeprecationWarning` and risks interleaved/incorrect
results); all four now run their queries sequentially instead.

## v008.A — 2026-09-12

**Bulk-generate employee logins.** New `POST /employees/generate-logins` (Admin-only)
and a "Generate logins" button on Settings → Employees. Creates a `users` row for
every employee in the tenant who doesn't already have one, keyed on their personal
email (`employees.email` — filled in via the People profile's Personal Details
card): Supervisor if anyone else's `managerId` points at them, Employee otherwise.
Never touches an employee who already has a login (so the seeded demo Admin/
Supervisor/Employee accounts are untouched) and never grants Admin. Everyone
created shares one default password (same as the seed script's `Passw0rd!`,
reused rather than inventing a new one, since there's no way to email credentials
out of this scaffold) — the Admin reads it off the result panel and passes it on
themselves. Guards against two employees sharing one personal email, and against
a personal email colliding with an existing login's, by skipping with a clear
reason rather than throwing. Result panel lists exactly who was created (with
role) and who was skipped (with why) so nothing happens silently.

**Verified:** `npm run typecheck`/`build` clean on both apps. Playwright: ran it
against the demo tenant — Chanda (no login yet, personal email added for the
test) got created as Employee, Priya and Sam were correctly skipped as
"Already has a login"; logged in as Chanda with the generated email/password
and landed on her dashboard; separately verified the Supervisor-role path by
adding a temporary employee, pointing another employee's `managerId` at them,
re-running, and confirming they were created as Supervisor — then cleaned up
all test data from the sandbox database afterward.

## v009.A — 2026-09-13

**Email notifications** for leave requests/decisions, announcements, and employee
detail changes — no email provider has been chosen yet, so this ships the
provider-agnostic code path now: a new `MailModule`/`MailService`
(`apps/api/src/common/mail/`) sends through any SMTP-speaking provider (Resend,
SendGrid, Postmark, Mailgun, SES, and similar all offer an SMTP relay, so one
`nodemailer` SMTP transport covers all of them unchanged) configured via
`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`. With no `SMTP_HOST`
set — the default, since no provider is configured yet — it falls back to a
dev-mode transport that logs what would have been sent instead of sending it, so
the feature works out of the box and every call site below is already fully
wired for the day real credentials are added. Every `send()` is wrapped so a
provider failure or bad credentials only logs a warning — it can never block the
leave/announcement/employee-update flow that triggered the notification. Module
is `@Global()`, registered once in `AppModule`, so every feature module can
inject `MailService` without its own import.

Four trigger points, all sending plain-text mail to the recipient's personal
email (`employees.email` — nothing is sent when that's blank, which is silently
skipped rather than treated as an error):

- **Leave requested** — `LeaveService.create()` emails the requesting employee's
  manager (if they have one) with the leave type, dates, day count, and reason.
- **Leave approved/declined** — `LeaveService.decide()` emails the employee once
  a decision is recorded. This required a small fix: `decide()` previously only
  looked up the employee row inside the non-Admin authorization branch, so an
  Admin-made decision fetched no employee row at all; it now always fetches it,
  so the notification fires regardless of whether an Admin or a Supervisor
  decided.
- **Announcement issued** — `SettingsService.createAnnouncement()` emails every
  employee within the announcement's scope, using the same
  ORGANIZATION/DEPARTMENT/SECTION filter logic as `announcementsForEmployee()`
  (inverted: which employees are in scope for this announcement, rather than
  which announcements are in scope for one employee).
- **Employee detail changed** — `EmployeesService.update()` now captures the
  pre-update row (previously discarded) and diffs it against the result for
  four fields specifically — job title, department, manager, and employment
  type — emailing the employee a plain summary of what changed if any of them
  did. Every other field (photo, contact details, custom fields, etc.) is
  ignored so routine edits don't generate noise; a manager change is resolved to
  both managers' names rather than raw IDs.

**Verified:** `npm run typecheck`/`build` clean. Ran the API directly against
the demo tenant (dev-mode transport, no SMTP configured) and confirmed each
trigger's console-logged "would send" output: Sam requesting leave logged an
email to Priya's personal address; Priya approving it, and separately an
Admin-decided decline (exercising the just-fixed no-employee-row-fetched path),
both logged an email to Sam; changing Sam's job title logged an email to Sam
with the old→new value, while a same-call change to an untracked field (mobile
number) correctly logged no email at all; an org-wide announcement logged an
email to both employees who have a personal email on file (and correctly
skipped the one who doesn't) and a department-scoped announcement correctly
logged only to that department's two employees. No warnings or errors in the
server log across any of these.

## v010.A — 2026-09-13

A batch of six requested enhancements to Organization Settings, Payroll, and
the app shell.

**Currency drives money formatting everywhere.** The Organization Settings →
Currency field is now a `<select>` populated from every currency the runtime's
`Intl.supportedValuesOf('currency')` knows about (with a small curated
fallback list for older runtimes) — the same live-`Intl`-with-static-fallback
pattern v006.A used for the Timezone dropdown. Whatever the Admin picks is the
single currency `formatMoney()` (`apps/web/src/lib/format.ts`) renders
everywhere money appears for every role: Payroll pay-run figures, payslips
(both the self-service view and the Admin drill-in), and every salary/
compensation figure on a People profile (Annual Salary in General Info, the
Job tab's Compensation History rows) — none of these read a hardcoded `$`
prefix or currency code anymore, they all thread the org's `currency` down
from the `organization-branding` endpoint.

**Zambia (ZM) is now the default native payroll country.** New tenants,
new employees, and new leave types now default to `ZM`/`ZMW` instead of
`NZ`/`NZD` (`organizationSettings.currency`, `employees.countryCode`,
`leaveTypes.countryCode` schema defaults; the Payroll page's country selector
now lists `ZM — native (default)` first). NZ remains a fully implemented,
fully selectable native ruleset on every payroll run — nothing was removed,
only which country a brand-new tenant starts on. The seeded demo tenant's
data was deliberately left untouched: Sam and Priya are genuinely NZ-based
staff and Chanda is genuinely ZM-based, reflecting the company's actual
dual-country footprint rather than a "default" claim, so scrubbing NZ out of
the seed data would have made the demo less accurate, not more.

**Employee/Supervisor payslip PDF download.** The existing self-service
payslip list (Payroll page, non-Admin roles) now renders a "Download PDF"
button under every payslip. Reuses the html2canvas + jsPDF client-side export
pattern v006.A built for the Org Chart: captures the rendered payslip card to
a canvas, embeds it into a PDF sized to match, and saves it as
`payslip-<firstname>-<lastname>-<period-end-date>.pdf`. Admin is correctly
excluded from this view (as before — Admin has no `employeeId`/employee
profile, so there's no "own payslip" to show).

**Admin payroll run summary, per-employee drill-in, and payroll
adjustments.** Selecting a pay run now shows a summary table — one row per
employee on that run (Employee, Department, Gross, Net Pay) — instead of every
payslip rendered inline. Clicking a row expands it into that employee's full
payslip (Pay Advice-style for ZM, the simpler card for other rulesets), with
its own Download PDF button. Below the pay-runs section, a new Additions &
Deductions panel lets an Admin select one or more employees, choose Addition
or Deduction, a label, an amount, and how many pay runs it should apply over
(1 for a one-off bonus, 3+ for an advance clawed back over several runs). New
`payroll_adjustments` table (tenant + employee scoped, RLS-protected) tracks
each adjustment's `occurrences`/`appliedCount`/`status`
(PENDING/COMPLETED/CANCELLED); `PayrollService.runPayroll()` now applies every
eligible employee's PENDING adjustments as a direct delta to that run's
`netPay`, increments `appliedCount`, and marks the adjustment COMPLETED once
it's been applied `occurrences` times. Each payslip stores a JSON snapshot of
the adjustments applied to it (`payslips.adjustments`) so what's shown on a
payslip doesn't change retroactively once the underlying adjustment later
completes or is cancelled. Admins can cancel a still-PENDING adjustment before
it's fully applied.

**Collapsible sidebar.** A small circular arrow button on the sidebar's edge
collapses it to an icon-only rail (`w-[4.5rem]`) or expands it back
(`w-60`); collapsed state is remembered per-browser via `localStorage` (safe
here since it's pure UI chrome, not data the app needs back server-side or
synced across devices). Nav links, the org logo, the signed-in user block, and
Log out all adapt — icon-only with a hover tooltip when collapsed, full
label when expanded.

**Branches, Designations, and Announcements are now all editable.** Each of
their Settings pages gained an edit (pencil) button per row/card alongside the
existing delete button, reusing the same `editingId`/`resetForm`/`startEdit`/
`save` pattern across all three: `startEdit` populates the form from the
clicked row and `save` does a `PATCH` instead of a `POST` when an id is being
edited. Designations additionally filters its own id out of the "Reports to"
dropdown while editing, so a designation can't be set to report to itself.
Branches' and Designations' `PATCH` endpoints already existed from v004.A —
only the frontend Edit UI was missing; Announcements needed a new
`UpdateAnnouncementDto` and `PATCH /settings/announcements/:id` route, which
correctly re-nulls `departmentId`/`sectionId` when an announcement's scope
changes away from Department/Section.

**Verified:** `npm run typecheck`/`build` clean on both apps. Ran the API and
web dev server directly against the demo tenant and drove it two ways —
curl and Playwright (Chromium via the pre-installed browser) — confirming:
the currency dropdown saves and immediately reflects in `formatMoney()`
output on Payroll and People profile salary figures (verified by round-
tripping the org currency to USD and back); a `ZM` payroll run correctly
applied a one-off ADDITION and a 3-run DEDUCTION as a `netPay` delta,
recorded the snapshot on the payslip, and correctly transitioned the ADDITION
to COMPLETED (`appliedCount` 1/1) while leaving the DEDUCTION PENDING at 1/3
applied; cancelling a PENDING adjustment correctly set it to CANCELLED without
touching its already-applied history; Sam (Employee role) can see and
download PDFs of his own payslips via `/payroll/payslips/me`, and is
correctly 403'd from the Admin-only `/payroll/adjustments` routes; the Admin
run-summary → row-click → full-payslip drill-in renders correctly with the
adjustments listed on the payslip itself; the sidebar collapses to an
icon-only rail and the toggle arrow flips direction; and Branches,
Designations, and Announcements each round-tripped a `PATCH` through their
new Edit buttons. All test data created during verification (the two ZM
payroll adjustments, above) was left in its final CANCELLED/COMPLETED state
in the sandbox database rather than deleted, since deleting would have meant
un-applying an already-processed payroll run.

## v011.A — 2026-09-13

A three-instruction batch unifying the Job tab's Compensation section across
every country and making scheduled payroll adjustments editable.

**Compensation is now one country-agnostic form.** The Job tab's Compensation
card no longer branches on `countryCode` (no NZ-only vs ZM-only styling or
fields) — every employee, regardless of country, gets the same form: a
**Currency** dropdown (defaults to the Organization's configured currency,
independently adjustable per entry — a record of what that specific historical
rate was quoted in, not a payroll input), **Basic Pay Rate** (renamed from Pay
Rate) with its **Pay Type** (Monthly/Annual/Hourly, unchanged), a repeatable
**Allowances** section (`+ Add allowance` inserts a row with a Type dropdown —
Housing, Transport/Vehicle, Meal/Lunch, Other — an Amount, and an optional
Note, each independently removable), and the retained Change Reason, Effective
Date, and Comment fields. Because the shared `AddableList`/`AddField`
component only supports flat fields, this card was hand-built rather than
reusing that pattern, while keeping the same card styling and Save/Cancel
conventions used elsewhere on the tab.

**Every native payroll ruleset now reads the same unified shape.** The old
per-country divergence — NZ computed from a standalone `employees.annualSalary`
field, ZM from a free-form `components` JSON blob — is gone. Both rulesets now
receive an identical `components: {basicSalary, housingAllowance,
transportAllowance, lunchAllowance, otherAllowance}` object, built centrally in
`PayrollService.runPayroll()` from the employee's latest compensation-history
row: `normalizeBasicToPeriod()` pro-rates the Basic Pay Rate into the specific
run's period (ANNUAL: `rate * periodDays/365`; MONTHLY: `rate * periodDays /
(365/12)`; HOURLY: `rate * 40hrs * periodDays/7`, illustrative — this scaffold
has no timesheet/hours-worked tracking), and each Allowance row is summed into
its matching component key. `employees.annualSalary` is retained only as a
display-only headline figure on the People profile (kept in sync from ANNUAL-
type compensation entries) and no longer feeds payroll math at all. As a
byproduct of the NZ ruleset now returning the same `{earnings, statutory}`
breakdown ZM does (annualising the period's gross for the progressive PAYE
brackets, then pro-rating the resulting tax back down), NZ payslips now also
render the full "Pay Advice"-style layout that was previously ZM-only — the
frontend's statutory rows are now driven dynamically by a label dictionary
(`STATUTORY_LABELS` + a camelCase-splitting fallback) instead of ZM's three
hardcoded fields, since NZ's statutory keys (`paye`, `accLevy`, `kiwiSaver`)
differ from ZM's (`paye`, `napsa`, `nhi`).

**Additions & Deductions are now editable in place.** Every still-`PENDING`
row on the Payroll page's Additions & Deductions panel gained an Edit
(pencil) button alongside its existing Cancel (trash) button, mirroring the
`editingId`/`startEdit`/`save`-branches-POST-vs-PATCH pattern v010.A
established for Branches/Designations/Announcements: clicking it swaps the
employee-picker for a read-only employee name and pre-fills Type, Label,
Amount, and Occurrences from the row, with Save changes/Cancel buttons. New
`PATCH /payroll/adjustments/:id` (`UpdatePayrollAdjustmentDto`, every field
optional) is restricted to `PENDING` adjustments — matching the existing
Cancel restriction, returning 404 for a `COMPLETED`/`CANCELLED` one — rejects
an edit that would drop `occurrences` below the adjustment's `appliedCount`
(400), and auto-completes the adjustment (flips it to `COMPLETED`) if the
edited `occurrences` now equals `appliedCount`.

**Schema.** `employee_compensation_history` (migration
`0011_compensation_currency_allowances.sql`, hand-written alongside a
hand-crafted `meta/0011_snapshot.json` since `drizzle-kit generate`'s
interactive rename-vs-drop prompt can't run in this non-interactive
environment — extending the project's existing hand-written-migration
convention to a non-RLS-only schema change for the first time): dropped the
old free-form `components` JSONB column; added `currency varchar(8) NOT NULL
DEFAULT 'ZMW'` and `allowances jsonb NOT NULL DEFAULT '[]'`. Existing rows
were correctly back-filled with the defaults on migrate.

**Verified:** `npx tsc --noEmit` and `npm run build` clean on both apps. Ran
the API and web dev servers directly against the demo tenant. Confirmed via
`curl`: a new NZD compensation entry for Sam (payRate 96000 ANNUAL + four
allowance rows, one with a note) round-tripped correctly through the new
nested-DTO validation; a resulting NZ payroll run's payslip matched
hand-calculated figures exactly (basicSalary $7,890.41, gross $9,440.41, PAYE
$2,283.35, ACC Levy $151.05, KiwiSaver $283.21, net $6,722.80 for a 30-day
period); a ZM run with a new `OTHER`-type allowance correctly summed it into
`otherAllowance` and gross pay; and the new `PATCH /payroll/adjustments/:id`
correctly accepted a normal edit, rejected `occurrences` below `appliedCount`
(400) after two applied runs, auto-completed the adjustment when `occurrences`
was edited down to match `appliedCount`, and 404'd a further edit attempt once
`COMPLETED`. Playwright (Chromium) confirmed on-screen: the redesigned
Compensation form (Currency/Basic Pay Rate/Pay Type/dynamic Allowance rows)
renders identically for an NZ employee (Sam) and a ZM employee (Chanda), with
no country-based branching; the NZ payslip now renders the full Pay
Advice-style breakdown with correctly-labelled statutory rows (PAYE Income
Tax, ACC Earner Levy, KiwiSaver); and the Additions & Deductions panel's new
Edit button opens a pre-filled form with the employee shown read-only, saving
via `PATCH`. (The client-side PDF export's `html2canvas` capture rendered at
an unexpectedly narrow width under headless Playwright specifically — the
on-screen payslip and its underlying data are confirmed correct either way;
this is unrelated to this batch's changes, which didn't touch the PDF-export
code path, and was not investigated further.) All test data created during
verification (Sam's and Chanda's new compensation entries, the extra payroll
runs, and the "Uniform deduction" test adjustment) was left in place in the
sandbox database rather than rolled back.

## v012.A — 2026-09-13

An eleven-instruction batch: structured addresses, branch-driven Job
Information locations, tabular Job-tab history, full edit-in-place across
every People-profile tab, a three-tab Payroll page, print-based payslips,
Compensation-driven payroll eligibility, company/personal regulatory
identifiers, and editable/deletable payroll runs with a new Regulatory
Submission tab.

**Structured addresses.** Organization Settings and Branches both replaced
their single free-text Address field with four structured fields — Street,
Town/City, Province, Country (Country a dropdown sourced from the existing
`COUNTRIES` reference list, storing the country name) — on both the form and
the read-only/table views, plus the CSV branch-import template.

**Job Information Location is now branch-driven.** `employee_job_history`
gained a `location_branch_id` FK alongside its existing `location` text
column; the Job tab's Job Information form replaced its free-text Location
field with a dropdown built from the tenant's Branches (labelled
"Town/City, Country"), and the server auto-computes and stores the
denormalized `location` string from the selected branch on every add/edit —
falling back to a raw string only if no branch resolves (e.g. legacy rows).

**Job-tab history sections are now tables, most-recent-first.** Status
History, Employment Type History, Job Information History, and Compensation
History all render as tables (Effective Date first column) instead of the
previous flex-row lists. Compensation History's table adds a computed
**Gross Pay** column (Basic Pay Rate + sum of all Allowance amounts) next to
Effective Date, Basic Pay Rate, Pay Type, Allowances, Change Reason, and
Comment.

**Every tab under a People profile is now editable in place, not just
addable.** Extended the shared `AddableList` component with an
`onEdit`/`editValuesFor` pair (reuses the existing add-form, pre-filled, for
editing) and an optional table-rendering mode (`columns`) with Edit/Delete
icons in an actions column. Wired this through: Job tab's four history
sections (new `PATCH` routes `status/:id`, `employment-type/:id`,
`compensation/:id`, `job-info/:id`, each re-deriving and pushing the
now-current denormalized value back onto the `employees` row so General
Info's "Work" summary stays correct whichever entry — old or current — was
edited); General Info's Work Experience, Education, and Dependents cards
(new `PATCH work-experience/:id`, `education/:id`, `dependents/:id`);
Performance's Reviews and Comments cards (new `PATCH`/`DELETE
reviews/:id`, `comments/:id`); and Documents, which gained an inline Rename
control (new `PATCH /employees/:id/documents/:id`) alongside its existing
Delete.

**Payroll is now three tabs.** Split the former single Payroll page into
**Pay Runs**, **Additions & Deductions**, and **Regulatory Submission**
(`apps/web/src/app/payroll/layout.tsx`, matching the route-based tab pattern
used by Settings) — Admin-only tab chrome; the non-Admin "Your payslips"
view is unaffected. Shared payslip/payrun types and components (`Payslip`,
`PayRun`, `PayslipCard`, CSV/print helpers, etc.) were factored out into
`apps/payroll/shared.tsx` so all three tab pages can import them.

**Payslip "Download PDF" is now Print.** Replaced the `html2canvas`+`jsPDF`
capture with `window.open()` into a blank window, copying the page's
stylesheets, then `printWindow.print()` — hands the browser's native print
dialog (Save as PDF, physical printer, page setup) to the user instead of a
single fixed-size rendered image. (Org Chart's PDF export is untouched — it
still uses `html2canvas`/`jsPDF`, unrelated to payslips.)

**Payroll eligibility now follows Compensation's Effective Date, not the
employee's Start Date.** `runPayroll()`'s compensation-history lookup gained
an `effectiveDate <= periodEnd` filter — an employee is only included in a
run once some Compensation entry takes effect on or before that run's period
end; an employee with no qualifying compensation entry yet is skipped for
that run, regardless of how long ago they started.

**New company-level and personal regulatory identifiers.** Organization
Settings gained **Superannuation No.**, **Tax ID**, and **Health Insurance
ID** (all alphanumeric-only, stripped client-side on input). Staff Basic
Info replaced **Driver Licence** with **ID No.** and added **Social Security
No.** and **Health Insurance No.** (alongside the pre-existing Tax ID
field) — all four now flow through to the payslip's projection (`taxId`,
`ssn`, `nhiId`, `idNo`) and render on the payslip via a new
`IdentifiersRow` when present.

**Executed payroll runs are now editable and deletable.** New `PATCH
/payroll/runs/:id` (period dates, status) and `DELETE /payroll/runs/:id`
on the Pay Runs tab, each run row gaining inline Edit/Delete controls
(Delete behind a confirm). Deleting a run best-effort rolls back any
one-off Additions & Deductions it applied: matches each payslip's
`adjustments` JSON snapshot back to its source adjustment by
`employeeId + label + type + amount`, decrements `appliedCount`, and
reverts the adjustment to `PENDING` if that drops it below `occurrences`
(no direct adjustment-id FK exists on payslips to do this exactly).

**New Regulatory Submission tab.** Three sections — Superannuation Returns,
PAYE Return, Health Insurance Return — each with Year/Month dropdowns
constrained to periods payroll has actually run for (derived from existing
Pay Runs, not free entry), a Generate Return File button that aggregates
that period's payslips client-side into a spec'd column layout, a results
table, and its own Export to CSV. Superannuation and Health Insurance
sections are ZM-ruleset-specific (filtered to payslips whose statutory
breakdown includes NAPSA/NHI respectively); PAYE applies across every
country. Two scope gaps are called out explicitly in the page's own copy
rather than silently faked: **Middle Name** always exports empty (no such
field exists in the data model) and PAYE's **Total Tax Credit**/**Tax
Adjusted** always export as 0 (not tracked anywhere in the system yet).

**Schema.** New migration `0012_org_identifiers_employee_ids_location.sql`:
`organization_settings` and `branches` each swap their single `address`
column for `street`/`town_city`/`province`/`country`; `organization_settings`
gains `superannuation_no`/`tax_id`/`health_insurance_id`;
`employees.driver_license` is renamed to `id_no`, with new `ssn`/`nhi_id`/
`tax_id` columns added alongside it; `employee_job_history` gains
`location_branch_id` (FK to `branches`).

**Verified:** `npx tsc --noEmit` clean on both apps after fixing
`db/seed.ts`'s now-stale `address` references. Migration applied cleanly
against the existing sandbox database (`riverbird-demo` tenant, pre-existing
real demo data — confirmed present via a superuser-bypass query before
touching anything, since RLS hides it from an unscoped session — left
untouched, not reseeded). Confirmed via `curl` end-to-end: organization/branch
structured-address and regulatory-ID round-trips; job history add with
`locationBranchId` auto-computing `location: "Auckland, New Zealand"` and
listing most-recent-first; job/status/type/compensation history edit-in-place
via the new `PATCH` routes, each correctly re-syncing the "current" value onto
the employee row; Basic Info identifier updates; a payroll run correctly
skipping an employee with no compensation entry effective by the period end;
a payslip projection carrying all four new identifiers through a real SQL
join; and pay-run `PATCH`/`DELETE` (confirmed removed from a subsequent
list). Playwright (Chromium) confirmed on-screen: Organization/Branches
structured-address forms and tables; the Job tab's history tables, branch-
driven Location dropdown, and computed Gross Pay column (manually verified
arithmetically correct); General Info's new identifier fields; all three
Payroll tabs including the redesigned Pay Runs list with Edit/Delete and the
Additions & Deductions panel; and the Regulatory Submission tab both at rest
and after actually generating a PAYE return for a real period — populated
with one correct row (Sam Ahia, gross emoluments $9,440.41, tax deducted
$2,283.35) while the ZM-specific Superannuation/Health Insurance sections
correctly reported no eligible payslips for that NZ employee's period.

## v013.A — 2026-09-13

A second, switchable theme, modeled on a reference fintech-dashboard
screenshot the user supplied: dark-navy sidebar, white canvas, blue accent,
a rounder geometric font — toggled from a small switch at the bottom of the
sidebar, next to the existing collapse control.

**Every themeable color/shadow/font became a CSS custom property.** The
original hardcoded values in `tailwind.config.ts` (`ink`, `accent`,
`chrome.bg/panel/panelSoft`, the `sidebar-gradient`/`brand-gradient`
background images, `shadow-card`, and the base font stack) now all resolve
to `var(--*)` tokens defined twice in `globals.css` — once under `:root`
(the original tmPro brand look, unchanged) and once under
`[data-theme="midnight"]` (the new option, colors sampled directly from the
reference screenshot: sidebar `#162237`, accent `#4988F7`, page background
`#F7F8FA`, ink `#101828`). Because dozens of existing pages already style
themselves through these same semantic Tailwind tokens rather than raw hex
values, the whole app re-skins from these two blocks alone — no page-level
markup had to change. The one exception left un-themed on purpose: the
per-person avatar palette (`avatar.tsx`) and the individual `brand.*` hue
swatches, which are a fixed identifying rainbow rather than "the" brand
color, and the tmPro logo image itself (same reasoning dark mode elsewhere
usually keeps a static logo mark).

**Toggling.** `app-shell.tsx` holds the active theme in state, flips
`data-theme="midnight"` on `<html>` (or removes it, for the default), and
persists the choice to `localStorage` (`tmpro:theme`) the same way the
existing sidebar-collapse toggle does. A small blocking script in
`layout.tsx`'s `<head>` reads that key and sets the attribute before first
paint, so a returning visitor who chose Midnight never sees a flash of the
classic theme first. The active nav item's highlight also became
theme-aware (`--nav-active-bg`): a translucent white overlay in the classic
theme (unchanged), a solid opaque accent-blue pill in Midnight, matching the
reference screenshot's active-item treatment rather than reusing the
translucent style, which read as barely visible against a dark-navy
sidebar.

**Font.** Midnight's `--font-sans` is `'Plus Jakarta Sans'` (loaded via a
Google Fonts `@import` in `globals.css`), a close, freely-licensed match for
the rounded geometric sans in the reference screenshot; the classic theme's
font stack (system sans) is untouched. New `IconPalette` in `icons.tsx` for
the toggle button itself.

**Verified:** `npx tsc --noEmit` clean. Playwright (Chromium) confirmed
on-screen: the Dashboard and People pages in both themes side-by-side (the
classic purple sidebar/lavender canvas unchanged; Midnight's navy sidebar,
white canvas, and solid-blue active pill matching the reference); the theme
choice surviving a full page reload with no flash of the other theme; and
the toggle rendering correctly collapsed to an icon-only sidebar.

## v013.B — 2026-09-13

A three-instruction follow-up to v013.A, all shipped together:

**Dashboard stat tiles are now thick rings, not teardrops.** `TeardropStat`
(kept its name and prop API — only callers, `dashboard/page.tsx`, needed no
changes) now renders a bold circular ring in the same brand-gradient colors
(cyan/violet/orange/indigo) instead of a rotated teardrop: an outer gradient
circle with a solid-white circle inset inside it, sized so the gap between
them is a consistent thick stroke (14px at the large size used for
Headcount/Departments/Pending Requests, 10px at the smaller size used on the
Supervisor dashboard), with the number centered in the white hollow in ink
text instead of white-on-gradient.

**Midnight theme's sidebar gradient is now a deeper blue-to-black.**
`--sidebar-gradient` under `[data-theme="midnight"]` in `globals.css` went
from a fairly flat, narrow navy range (`#182946` → `#162237` → `#101a2c`) to
a more dramatic spread — a rich deep blue at the top (`#1b2a6b`) through
dark navy (`#0d1330`) down to near-black at the bottom (`#05070d`).
`--chrome-panel`/`--chrome-panel-soft` were updated to match (not currently
used by any component directly, but kept in sync with the gradient's
palette for when something does reference them).

**The Payroll page's explanatory sub-heading is gone.** The "Native ruleset
defaults to Zambia (ZM). NZ is also available..." paragraph under the
"Payroll" title in `payroll/layout.tsx` (originally written as in-app
documentation of the `PayrollRuleset` design) was removed — the page now
opens straight from the heading into the tab strip.

**Verified:** `npx tsc --noEmit` clean. Playwright (Chromium) confirmed
on-screen: the ring stat tiles rendering correctly in both themes with the
number legible in the white hollow; the Midnight sidebar's new gradient
visibly darker toward the bottom rather than a flat navy block; and the
Payroll page opening straight into the tab strip with the narration
paragraph gone.

## v013.C — 2026-09-14

A one-instruction bug fix, prompted by the user noticing a MONTHLY-paid
employee's payslip Basic Salary come out lower than their Compensation
record's Basic Pay Rate after running payroll.

**Root cause:** `PayrollService.normalizeBasicToPeriod()` re-scaled every
payType's Basic Pay Rate by `periodDays`, including MONTHLY — even though a
MONTHLY rate is already quoted per pay period and needs no day-based
scaling. Two compounding bugs made this visible: (1) `periodDays` itself was
computed as a bare date-diff (`periodEnd - periodStart` in days) rather than
an inclusive day count, so a 30-day September came out as 29; (2) that count
was then divided by `DAYS_PER_MONTH` (365/12 ≈ 30.44, an average month
length), so even a correctly-counted 30-day month would have come out
~1.4% short. Together, for a K185,000 monthly Basic Pay Rate on a September
2026 run, this silently paid out K176,383.56 — about K8,616 (4.7%) short —
with every downstream figure that reads Basic Salary (Gross/Taxable Pay,
National Health Insurance's 1%-of-Basic calculation) shrinking to match, so
the payslip looked internally consistent and the shortfall wasn't obvious
without comparing back to the Compensation tab.

**Fix:** `normalizeBasicToPeriod()` no longer day-scales the MONTHLY case at
all — it returns the Basic Pay Rate unchanged, so every full-period run
pays exactly the rate on file, whatever the calendar month's actual length.
ANNUAL and HOURLY (which aren't already quoted per pay period) are
untouched and still scale by `periodDays`; that date-diff's own off-by-one
was deliberately left as-is for this fix rather than changed alongside it,
since neither is affected by the bug the user reported, and changing it
would also change tax banding for NZ's per-period-annualised PAYE calc.
`DAYS_PER_MONTH` is now unused and was removed.

**Note:** this only corrects *future* payroll runs — it does not retroactively
recalculate or reissue any pay run already executed under the old formula
(including Jeff Daka's September 2026 run pictured in the report that
surfaced this). Correcting an already-executed run means deleting and
re-running it (both supported as of v012.A) if the user wants that pay
period reissued.

**Verified:** `npx tsc --noEmit` clean for `apps/api`. Reproduced the exact
reported shortfall (K185,000 → K176,383.56) by hand from the pre-fix
formula, confirmed the fixed formula returns K185,000.00 unchanged.

## v013.D — 2026-09-14

**Requires a database migration before this build's payroll will run —
see "Migration" below.**

A payroll **proration engine**, requested to correctly handle: new
employees; employees leaving; unpaid leave; mid-month salary increases;
mid-month transfers; promotions; changes in working hours; employees
joining/leaving during February; employees changing from hourly to
salaried; and terminations.

**The mechanism.** Every native ruleset (ZM, NZ) reads one shared shape —
`basicSalary` plus typed allowances for the pay period — and until now
`PayrollService` built that shape from a single Compensation snapshot as
of the period's end, scaled by the whole period's day count (v013.C fixed
that scaling for the common no-change case). That single-snapshot model
can't represent anything that changed *during* the period. It's replaced
with a day-by-day resolution: for every calendar day of the pay period,
resolve the Employee Status in effect that day (most recent Employee
Status History row with an effective date on or before it) and, only if
that status is ACTIVE, the Compensation entry in effect that day (same
rule) — then that day earns its one-day share of that entry's Basic Pay
Rate and Allowances, unless the day falls inside an APPROVED leave request
whose Leave Type is marked unpaid, in which case it earns nothing. Summing
every day's share over the period produces exactly the same `components`
shape every ruleset already consumed — so **ZM's and NZ's tax/statutory
code needed zero changes** — while now correctly reflecting whatever
happened during the period, with no per-scenario special-casing:

- **New employees / employees joining during February** — days before
  Status flips to ACTIVE (or before the first Compensation entry takes
  effect) earn nothing; days from the effective date on earn their share.
  A short month like February isn't a special case — its real day count
  (28 or 29) is what the day-by-day sum naturally divides by.
- **Employees leaving / terminations / employees leaving during
  February** — the mirror image: days from the new OFFBOARDING/ALUMNI
  status's effective date onward earn nothing. Convention (unchanged from
  how Effective Date already worked): log the new status effective the day
  *after* the employee's last paid day — leaving after 15 Sept means that
  status is effective 16 Sept, so the 15th still pays.
- **Mid-month salary increases / promotions** — days before a new
  Compensation entry's effective date use the old rate, days on/after use
  the new one. A promotion is just a Compensation change like any other;
  no separate mechanism needed.
- **Mid-month transfers** — a Job History change alone (department,
  location, manager) is *not* a pay input under this engine and doesn't
  trigger reproration on its own, since Job Information and Compensation
  are already two independently-dated logs. A transfer only affects pay if
  it comes with its own new Compensation entry (e.g. a location-linked
  allowance changing).
- **Unpaid leave** — `leaveTypes` gained an `isPaid` boolean (default
  `true`); an APPROVED request against a `false` Leave Type deducts its
  exact calendar-day span (intersected with the pay period) from what
  would otherwise be a normal ACTIVE, in-effect-Compensation day. Leave
  Types still have no Settings UI (a pre-existing gap — seed/DB-managed
  only); the seed now includes an "Unpaid Leave" type so this is testable
  without a direct DB edit.
- **Changes in working hours / hourly to salaried** — `employeeCompensationHistory`
  gained an optional `hoursPerWeek` (new "Hours/week" field on the Job
  tab's Compensation form/table; blank = standard 40). A new Compensation
  entry with a different `hoursPerWeek` is how an hours change is
  recorded — it scales MONTHLY/ANNUAL pay by `hoursPerWeek / 40` and is
  read directly as HOURLY's weekly hours. Switching `payType` itself
  (HOURLY → MONTHLY) is just another Compensation change, so a day-by-day
  split between the old HOURLY rate and new MONTHLY rate falls out with no
  extra logic.

**Payslip transparency.** Every payslip now carries a `proration` block
(`payableDays`/`periodTotalDays`/`prorated`) in its `components`, and the
Payroll page shows an amber "Prorated — paid for X of Y days this period"
note whenever `prorated` is true, so a smaller-than-expected net pay always
comes with an on-payslip explanation instead of looking like an
unexplained shortfall. A normal full-period payslip is unaffected — it
just doesn't show the note.

**Eligibility changed too.** Payroll no longer pre-filters to
`employees.status = 'ACTIVE'` before considering someone for a run (a
person who left mid-period may already show ALUMNI by the time payroll
actually runs, and still needs their partial pay). Every employee in the
run's country is now a candidate; anyone with zero payable days across the
whole period (never ACTIVE with in-effect Compensation) is simply skipped,
same end result as before for the common case.

**Migration.** Two new nullable/defaulted columns —
`employee_compensation_history.hours_per_week` and
`leave_types.is_paid` — via `drizzle/0013_add_proration_fields.sql`. Run
`npm run db:migrate` in `apps/api` before restarting the API; every
existing Compensation row behaves exactly as before (null `hoursPerWeek` =
standard 40) and every existing Leave Type defaults to paid, so nothing
about current data changes until someone explicitly sets an hours figure
or marks a leave type unpaid.

**Known gaps, called out rather than silently glossed over:**
- NZ's PAYE annualises the period's *gross* to look up the tax bracket,
  then pro-rates the tax back down. For a prorated (partial) period that
  annualises the employee's *reduced* earnings rather than their true full
  rate, which can land them a bracket lower than their real annual rate
  would — same "illustrative... NOT verified current IRD rates" caveat
  this ruleset already carries elsewhere. ZM's bands apply directly to the
  period's gross, so this doesn't affect ZM.
- Leave Types (including the new `isPaid` flag) still have no Settings
  CRUD — seed/DB-managed only, a pre-existing gap this didn't fix.
- This queries every employee in the country on every run and walks each
  one's period day-by-day in application code, rather than pre-filtering
  or pushing the resolution into SQL — fine at this scaffold's scale, a
  known scaling tradeoff for a tenant with a very large, long-tenured
  headcount.

**Verified:** `npx tsc --noEmit` clean for both `apps/api` and `apps/web`.
The day-by-day math was pulled out into a standalone script and checked
by hand against 9 scenarios spanning the full request list — a new hire
starting the 22nd, a leaver offboarding the 16th, 5 days of unpaid leave,
a mid-month raise, a mid-month hours cut, a mid-month hourly-to-monthly
switch, a full 28-day February, joining mid-February, and a full
unchanged month (Jeff Daka's exact v013.C case, confirming it still comes
out to exactly K185,000.00 — this doesn't regress the previous fix).

## v013.E — 2026-09-14

A four-instruction batch, no schema changes and no migration needed.

**Demo accounts are now Zambian, on the real stockhub.net domain.** The
seeded demo employees are Bupe Zulu (Engineering Supervisor, was "Priya
Nair") and Kunda Phiri (Software Engineer, was "Sam Ahia") — countryCode,
country, city and phone updated to ZM/Zambia/Lusaka. Their login emails
are now exactly `admin@stockhub.net`, `priya@stockhub.net` and
`sam@stockhub.net` as specified — kept literally as given even though the
underlying names changed, so the login you type doesn't have to match the
employee's own first name. The demo tenant slug (`riverbird-demo`) and
organization name are unchanged — only the two employees and the three
login emails moved. Login page defaults/hints and the README demo-login
table updated to match.

**Job tab history entries are now deletable, Admin-only.** All four dated
history logs (Employee Status, Employment Type, Compensation, Job
Information) previously supported Add and Edit-in-place only; each row now
also shows a delete icon next to the edit pencil, gated behind the same
Admin-only `canEdit` the pencil already used. Three of the four already
ran through the shared `AddableList` component, which already had
`onDelete` support built in and unused — wiring it up was the whole
frontend change for those three. Compensation is a hand-built table (not
`AddableList`, for its repeatable Allowances sub-list), so it got a
matching delete button added directly. New backend: a `DELETE` route per
history type, each Admin-only and each re-deriving the employee's
denormalized "current" field (status/employmentType/compensation-driven
annualSalary/location-department-designation-manager) from whichever
entry is now latest by effective date after the delete — the exact same
re-derivation the existing PATCH routes already do, so deleting the
*current* entry falls back cleanly to the next one instead of leaving a
stale value. Deleting the only remaining entry leaves the denormalized
field as-is (nothing left to derive it from). Note: this only removes the
history row — it doesn't retroactively touch any payslip a past payroll
run already generated from that entry's numbers.

**Additions & Deductions' employee picker is now a dropdown.** The
"Employees" field for scheduling a bonus/deduction was a permanently-open,
scrolling checkbox box; it's now a closed-by-default dropdown button
(labelled with a summary — a name or two, or "N employees selected") that
opens into the same checkbox list on click, and closes on an outside click
or Escape. No backend change — same `employeeIds` array submitted either
way.

**Employee/Supervisor payslip view is now Month/Year-picked, not a wall
of payslips.** The self-service "Your payslips" page used to render every
payslip the person has ever had, stacked one after another — unwieldy for
anyone with more than a couple of pay runs behind them. It's now a
Month/Year picker restricted to periods that already have one of the
person's own payslips on file (grouped by `periodEnd`, same pattern
Regulatory Submissions already uses for its own period picker) plus a
"View Payslip" button; only the selected payslip renders below, with the
existing Print action. Defaults to the most recent period on file so the
pickers are never left empty, but nothing renders below until "View
Payslip" is clicked (and clicking either dropdown clears whatever was
showing, so the picker and the payslip on screen can't drift out of sync).
No backend change — still the same `/payroll/payslips/me` list, just
presented one period at a time.

**Verified:** `npx tsc --noEmit` clean for both `apps/api` and `apps/web`.

## v015.A — 2026-09-15

A five-instruction batch: three corrections to v014.A's leave accrual engine,
and a new Training / LMS module. **Requires a database migration**
(`npm run db:migrate` in `apps/api`) — four new tables (`courses`,
`course_quiz_questions`, `course_quiz_options`, `course_assignments`).

**Leave accrual corrections** (`leave.service.ts`):
- The accrual cycle's anchor date now comes from the Job tab's **Employee
  Status** history (the earliest Employment Status entry's Effective Date)
  instead of Compensation, for both Carry-Over on and off. Payroll's own
  start-date concept is unaffected — it still runs off the Compensation
  tab's Effective Date, per the original v012.A behaviour.
- Every leave type other than Annual Leave (i.e. every ANNUALLY-accrual
  type in the catalog) is now available **in full as soon as the current
  annual cycle has begun**, rather than accruing gradually across the
  year — `periodsElapsed()`'s ANNUALLY branch now counts the in-progress
  cycle as one full period on top of however many complete prior cycles
  have elapsed. Annual Leave itself is unaffected (still MONTHLY,
  building up 2 days/month as before).
- **Paternity Leave** is now restricted to employees with Gender = Male
  and **Maternity Leave** to Gender = Female (General Info → Basic
  Information), enforced both in the Request Leave form's Type dropdown
  and server-side in `LeaveService.create()`.

**Dashboard leave widget.** The Dashboard's own leave-balance cards (for
Employees and Supervisors) now show only Annual Leave plus any other type
the person has actually applied for — not the full nine-type catalog at
zero. They've also moved into a narrow, sticky far-right column, rendered
at roughly a third of their previous size, so the main dashboard content
(summaries, announcements, quick links) keeps the full-width column to
itself. The full catalog with every balance is still on the Leave page,
unchanged.

**Training module** (new `courses` / `course_quiz_questions` /
`course_quiz_options` / `course_assignments` tables, new `training`
API module, Row-Level Security in `0016_rls_training.sql`):
- **Settings → Training** (Admin-only, new tab): add a course (title +
  image + a course URL — a YouTube link renders embedded on "My
  Courses"), author an MCQ quiz for it (any number of questions, each
  with its own options and exactly one marked correct), and Publish it —
  only published courses are selectable for assignment. Unpublish,
  edit, and delete are all supported too.
- **Training sidebar page** — restructured from its old "not built yet"
  stub into two sections: **My Courses**, showing everyone's own
  assigned courses (image, title, and a Pending/Started/Completed status,
  plus the quiz score once completed) with a click-through player —
  YouTube links play embedded in the page (with a Maximize control, on
  top of the player's own native fullscreen) — that auto-marks an
  assignment Started on open, and either a Take Quiz flow (grades
  server-side, marks Completed with the score) or a plain Mark as
  Complete button for a course with no quiz; and **Assign Courses**
  (Supervisor + Admin only), which picks a published course and any
  number of staff (a Supervisor's own direct reports, or anyone
  tenant-wide for an Admin) and allocates it with one Assign click —
  already-assigned staff are silently skipped rather than erroring, so
  re-running an overlapping selection is safe.
- Quiz-taking never receives which option is correct over the wire —
  only whoever is authoring the quiz (Settings → Training) does; grading
  happens entirely server-side against the stored answer key.
- Demo seed data: a published "Workplace Health & Safety Induction"
  course with a two-question quiz, assigned (Pending) to Kunda, plus an
  unpublished draft course for trying the Publish flow.

**Verified:** `npx tsc --noEmit` clean for both `apps/api` and `apps/web`.

## v014.A — 2026-09-15

Two-part delivery: a configurable, per-country leave-accrual system, and a
redesigned login screen. **Requires a database migration**
(`npm run db:migrate` in `apps/api`) — two new columns on `leave_types`
(`accrual_period`, `carry_over_enabled`) and a widened `country_code`.

**Settings → Leave.** A new Admin-only tab: pick a country regime (Zambia —
Native, Malawi — Native, South Africa — Native, or Other) from a dropdown
and a table appears below it — the fixed 9-type leave catalog (Annual,
Sick Leave – Long-term Contract, Sick Leave – Short-term Contract,
Maternity, Paternity, Compassionate/Special, Study, Unpaid, Other; Public
Holidays is deliberately excluded — it's a calendar entry, not a
balance-tracked leave type) with No. Days Accrued, Accrual Period
(Daily/Monthly/Annually) and a Carry-Over checkbox per row, plus
Update/Save. Every regime is auto-provisioned with the same 9 rows the
first time it's opened — Zambia's come pre-filled with starting figures
from the supplied statutory-baseline table (flagged in the UI as a
starting point, not legal advice), the other three start blank.

Behind the settings screen is a real accrual engine, not just static
config (`leave.service.ts`): each employee draws on the regime matching
their own `countryCode`, falling back to `Other` if their country has no
regime configured yet. The accrual cycle anchors to that leave type's
Carry-Over setting — checked: the employee's own Start Date under
Compensation (their earliest Compensation entry's Effective Date, or their
People profile Start Date if they have no Compensation history yet), and
the balance accumulates indefinitely; unchecked: 1 January of the current
year (or their start date if they joined later that year), and the balance
resets to zero every New Year. Balances recompute on every read of
`/leave/my-balances` (accrued-per-period since the cycle anchor, minus
APPROVED requests taken inside the same cycle) rather than needing a
background job — so they self-correct the moment anyone opens their Leave
tab. Also fixed a pre-existing seed bug: the demo employees (Bupe and
Kunda, both ZM) had their leave types seeded under New Zealand; they're
now properly seeded under Zambia with the statutory-baseline defaults.

**Redesigned login screen.** Split layout: a brand-gradient panel with the
"People Ops and Payroll that flex to every country you hire in" headline,
four feature bullets (configurable payroll, leave & attendance, multi-
country rulesets, regulatory submissions), and a screenshot of the People
directory; a white panel with a triangular cluster of three ring portraits
above the tm|Pro logo, the sign-in form, and a "Trusted by" strip (four
partner logos, each labelled with a country) pinned near the bottom. All
existing login functionality — tenant/email/password, error handling, the
demo-login hints, and the careers-page link — is unchanged underneath the
new styling. "Register your organisation" is left as plain text rather
than a link, since there's no self-serve sign-up flow behind it yet. The
marketing panel hides below the `lg` breakpoint so mobile still gets a
clean, form-only screen.

**Verified:** `npx tsc --noEmit` clean for both `apps/api` and `apps/web`.

## v016.A — 2026-09-16

Identifier-first login. **Requires a database migration**
(`npm run db:migrate` in `apps/api`) — replaces the case-sensitive
`(tenant_id, email)` unique index on `users` with a case-insensitive one.

The "Organization" field is gone from the sign-in form. Instead:

- **New `POST /auth/identify`** (`auth.service.ts`) takes just an email and
  looks it up across every tenant (case-insensitively), returning each
  matching organization's slug, name, logo, and a display name pulled from
  the linked employee/candidate record. Since email is only unique *within*
  a tenant (deliberately — two unrelated organizations can each have their
  own "jeff@acme.com"), the same address can resolve to more than one
  match. Rate-limited (8 lookups / 5 min per IP+email — see
  `rate-limit.guard.ts`) since this is an email-enumeration surface by
  design, same trade-off every identifier-first login makes (Slack, Okta,
  Dropbox).
- **Login page** (`apps/web/src/app/login/page.tsx`) is now a 3-step flow:
  email → an org picker (only shown when the email matches more than one
  tenant) → a password screen with the resolved org's logo/name locked in
  and "Welcome back, `<name>`" when a display name is available. The demo
  login shortcuts still work — clicking one jumps straight through
  identify.
- **Email is now case-insensitive everywhere**, not just in this new flow —
  `POST /auth/login`'s lookup was updated to match
  (`drizzle/0017_case_insensitive_email.sql` normalizes existing data and
  replaces the unique index with one on `(tenant_id, lower(email))`; every
  write path — `AuthService`, `EmployeesService.generateLogins`,
  `seed.ts` — already lower-cased on write, so this is the DB-level
  backstop matching that convention, the same two-layer pattern this
  schema already uses for tenant isolation).

**Known limitation, deliberately not solved here:** `identify()`'s
cross-tenant read runs outside `withTenant()`, so it isn't scoped by the
Postgres Row-Level Security policies the rest of this file relies on (it
can't be — the tenant isn't known yet). That's currently fine only because
the app's DB role is a Postgres superuser under the default docker-compose
setup, which bypasses RLS outright. A production deployment that locks
that role down (recommended) will need a `SECURITY DEFINER` function or a
narrowly-scoped bypass role for this one query — flagged in a comment on
`AuthService.identify()` rather than left as a silent gap.

**Verified:** `npx tsc --noEmit` clean for both `apps/api` and `apps/web`.

## v016.B — 2026-09-16

Bug fix, reported by the user immediately after v016.A: `POST /auth/identify`
returned "We couldn't find an account with that email." for every email —
including the seeded demo accounts — on the user's own local Postgres.
**Requires a database migration** (`0018_identify_cross_tenant_read.sql`).

Root cause was exactly the limitation v016.A's own VERSION-LOG entry called
out rather than hid: `identify()`'s cross-tenant read runs before any tenant
is known, so `app.current_tenant_id` is unset for that query — the existing
`tenant_isolation` RLS policies compare `tenant_id = current_setting(...)`,
which is `NULL` when unset, so with `FORCE ROW LEVEL SECURITY` the query
silently returned zero rows on any Postgres role that isn't a superuser or
BYPASSRLS-privileged. That only happened to work in the default
docker-compose setup, where `POSTGRES_USER` bootstraps as a superuser — the
user's own local Postgres install doesn't, so the query returned nothing for
every email, valid or not.

Fixed with a narrowly-scoped RLS policy rather than a privilege escalation:
a new permissive `identify_lookup` policy on the four tables `identify()`
reads (`users`, `organization_settings`, `employees`, `candidates`),
`USING (current_setting('app.current_tenant_id', true) IS NULL)`. Every
other query in the app runs inside `withTenant()`, which always sets that
setting first, so this policy only ever applies to the one deliberately
cross-tenant, pre-authentication lookup — no change to tenant isolation for
anything else. No application code changed; `AuthService.identify()`'s
doc comment was updated to point at the fix instead of still warning about
the gap. `apps/api/.env.example`'s `DATABASE_URL` (the `tmpro` role, which
docker-compose's official Postgres image bootstraps as a superuser) was
untouched — this fix means identify() now also works correctly for anyone
running against a non-superuser role, docker-compose or not.

**Verified:** `npx tsc --noEmit` clean for `apps/api` (no web changes this
round).

## v017.A — 2026-09-16

Three instructions in one batch: land the login hero graphic (finally —
after four rounds of mockup review across v016.A/B, ending on "Version 1 —
Moderate shift" for the composite and "Version 4 — deep navy with brand
glows" for the background), wire up "Register your organisation", and build
out the public careers site that "Go to the careers page" has pointed at
since v016.A without anything behind it. **Requires a database migration**
(`0019_many_moira_mactaggert.sql`) — a new `org_signup_requests` table, and
eight new columns on `requisitions` for public job-ad content.

**Login hero.** `/login-people-screenshot.png` — the flat, low-resolution
screenshot flagged as blurry two rounds ago — is gone. In its place,
`LoginHeroComposite` (`apps/web/src/components/login-hero-composite.tsx`)
renders the same People-list-behind-Regulatory-Submission graphic as real
markup: resolution-independent, crisp at any DPI, no re-export needed if the
content ever changes. It's the approved "Version 1 — Moderate shift"
layout — the Regulatory Submission card shifted right to expose the People
table's avatar photos and names, with an attached-tab person-summary card
(Terrence Banda) tucked above the People card, no tilt — using the six demo
headshots supplied for this graphic (`apps/web/public/people/`). The hero
panel's background is the approved "Version 4" treatment: a fixed deep-navy
gradient with soft brand-color glows in the corners, applied as an inline
style rather than the theme-switched `bg-brand-gradient` utility, since this
panel is marketing artwork shown to signed-out visitors who have no theme
preference set. One bug caught in local verification before shipping: the
composite's own `.card` class name collided with the app-wide Tailwind
`.card` utility (`bg-white border rounded-2xl p-5 shadow-card`) — both
applied to the same elements, and the extra padding pushed the sidebar's
last nav item ("Reports") outside the card's clipped bounds. Renamed to
`.heroCard` to fix it; worth remembering for any future component that
reuses "card" as a bare class name.

**Register your organisation.** Previously plain, inert text (deliberately,
per its own code comment — no flow existed behind it). Now a real link to
`/register-organisation`: a two-panel page matching the login screen's
visual language (same fixed dark-navy/brand-glow hero panel on the left,
listing tmPro's modules) with a form on the right — name, work email,
organisation name, a country dropdown (reusing the existing `COUNTRIES`
reference list), staff complement, and a checkbox grid for which of
tmPro's eight modules they need. Submits to a new public `POST /org-signup`
(rate-limited, same `RateLimitGuard` used on `/auth/identify`), which
writes to the new `org_signup_requests` table for an ops person to action
manually — tmPro has no self-serve tenant provisioning yet, so this is lead
capture, not account creation, same distinction the framework doc draws for
the candidate-facing apply flow.

**Public careers site.** The real Phase 2 extension the requisitions
scaffold's own code comment called out as unbuilt: "the full
posting/interview/offer workflow isn't built out yet — this is the seam to
extend." An `APPROVED` requisition now doubles as a live job ad. New
`CareersModule` (`GET /careers/:slug`, `GET /careers/:slug/jobs`,
`GET /careers/:slug/jobs/:jobId` — all public, no auth) serves only
`APPROVED` rows and only the public-safe columns; `budget`, `requestedById`,
and `approvedById` are never selected. `requisitions.approve()` now stamps
`publishedAt`, which is what the public list sorts by. Two new pages:
`/careers/[tenantSlug]` (tenant logo/name, a brand-gradient hero banner, a
client-side keyword/location filter, and a job list — laid out like the
reference job-board image the user supplied, in tmPro's own theme and
colors instead of copying its branding) and `/careers/[tenantSlug]/[jobId]`
(Your Role / What you'll do / What you'll bring / What you'll get / Why Us
— each section skipped if empty rather than showing a blank heading — with
an Apply button that reveals an inline first name/last name/email/optional
resume-link form). Apply submits to the existing `POST
/requisitions/:id/apply` unauthenticated endpoint from the requisitions
scaffold, unchanged. Bare `/careers` (no tenant) now redirects to
`/careers/riverbird-demo` — the pre-auth login screen's "Go to the careers
page" link has no specific tenant to point at, so this keeps it working
and preserves the old `?tenant=` query-param links from the previous
`/careers` stub. `AppShell`'s public-route check changed from an exact
match to a prefix match for `/careers`, and added `/register-organisation`,
so neither gets the dashboard sidebar chrome even for a signed-in visitor
previewing their own tenant's page.

To make this genuinely usable rather than backend-only: the internal
Requisitions page gained Employment Type and Location fields on the create
form, and a "Public listing" panel per requisition (Your Role / What you'll
do / What you'll bring / What you'll get / Why Us as editable textareas,
saved via a new `PATCH /requisitions/:id`) so Supervisors/Admins can
actually populate a public job ad, not just approve a bare title. The seed
data now includes four fully-written, `APPROVED` demo roles for
`riverbird-demo` (Senior Software Engineer, Payroll & Compliance
Specialist, Customer Success Manager, People & Talent Coordinator) so
`/careers/riverbird-demo` has real content out of the box.

Deliberately not built: the "alert" (email subscription) UI visible in the
reference job-board image. Building a UI control that looks actionable but
sends nowhere didn't seem right — the app already has a precedent
(`Register your organisation`'s old plain-text treatment) for leaving
something out entirely rather than half-wiring it. Can be a follow-up if
wanted.

**Verified:** `npx tsc --noEmit` clean for both `apps/api` and `apps/web`.
Ran end-to-end locally — migrated + seeded a fresh Postgres, started both
dev servers, and exercised every new surface in a real browser: the login
hero (all nine sidebar nav items visible after the `.card` fix, real photos
crisp at 1440px and smaller viewports), `/register-organisation` submit,
`/careers/riverbird-demo` list + search filter, a job detail page's Apply
flow (`POST .../apply` returns 201 with a real candidate row), and the
internal Requisitions page's new fields and Public listing editor
(`PATCH` round-trips and re-populates correctly).

## v018.A — 2026-09-17

Closes the gap identified in a design discussion with the user right after v017.A:
tmPro had no way for the platform owner to control which modules a tenant can use, or
cap how many employee seats they get — every tenant implicitly had everything,
unconditionally, with no enforcement anywhere. This version adds real, enforced tenant
entitlements plus an admin screen to manage them. **Requires a database migration**
(`0020_tenant_entitlements_and_platform_admins.sql`) — `enabled_modules`/`seat_cap` on
`tenants`, a new `platform_admins` table.

**The model.** `apps/api/src/common/modules/module-catalog.ts` is the canonical list of
tmPro's 8 modules — the exact same keys as the "Register your organisation" form's
feature checklist (`featuresNeeded`), so a lead's requested features could, in
principle, be copied straight into a tenant's `enabledModules` with no translation
step. Not all 8 are actually enforceable yet: **Employee Records** is core (every
tenant has it, unconditionally — it's the system of record everything else
references, per the framework doc), and **Policies & Documents** has no dedicated
backend module to gate (`/documents` is just the employee's own Documents tab, part of
Employee Records) — both are still shown in the admin GUI, clearly labeled, rather
than silently dropped, so a converted lead's request isn't lossy. The other 6 —
Leave & Attendance, Performance Management, Payroll, Recruitment, Training & LMS,
Reports & Analytics — are real gates: a new `ModuleGuard` + `@RequiresModule()`
decorator, applied to `LeaveController`, `PerformanceController`, `PayrollController`,
`RequisitionsController` (every route except the public, unauthenticated `apply`
endpoint — disabling Recruitment stops new postings from being raised/approved, which
is enough; blocking `apply` too would just 403 a candidate mid-application for
something outside their control), `TrainingController`/`TrainingAdminController`, and
`ReportsController`. A tenant's `enabledModules` also now rides along in the login
response so `AppShell`'s sidebar can hide nav links for modules a tenant doesn't have
— cosmetic only; `ModuleGuard` on the API is the actual enforcement, so a stale
cached session (or a stale nav item) can't grant access the API wouldn't otherwise
allow. A migration one-liner grandfathers every tenant that existed before this
version onto all 8 modules (nothing that worked yesterday broke today); a tenant
created after this version starts with none until the platform owner grants some —
that's the "manual provisioning" model discussed, not an oversight.

**Seat cap.** `tenants.seatCap` (nullable — `null` = unlimited) is enforced in
`EmployeesService.create()`, counting every employee except `ALUMNI` status as an
occupied seat (`common/seats/seat-policy.ts`, shared with the admin GUI's seat-usage
display so the two numbers never drift apart). Enforced there rather than only in the
frontend means it also holds for the bulk "Generate logins" CSV-import path, which
calls the same `create()` per row.

**The admin screen.** A platform owner is not a tenant's own ADMIN — it's a new,
entirely separate `platform_admins` table and login (`/platform-admin`, backend
`POST /platform-admin/auth/login`), deliberately outside RLS tenant-isolation, same
reasoning as `tenants` and `org_signup_requests` (its whole job is reading/writing
*across* tenants). Its JWT carries a `scope: 'platform'` claim that the tenant-scoped
`JwtStrategy` explicitly rejects, and vice versa (`PlatformAdminJwtStrategy` rejects
anything without that claim) — verified locally that a tenant token 401s against
`/platform-admin/tenants` and a platform token 401s against `/leave/types`, not just
assumed from the code. The frontend gets its own auth context
(`lib/platform-auth.tsx`, its own `tmpro_platform_session` localStorage key) and its
own minimal layout — `AppShell` excludes `/platform-admin` from the tenant sidebar
chrome, same as `/careers`. Two screens: `/platform-admin` lists every tenant with its
module count and seat usage (`used / cap`, or "unlimited"); `/platform-admin/tenants/:id`
is the edit screen — a checkbox grid mirroring the registration form's feature
checklist (Employee Records shown locked-on, Policies & Documents labeled "not a
separate module yet") plus a seat-cap number input (blank = unlimited), one Save.
Deliberately out of scope for this version: converting an `org_signup_requests` lead
into a new tenant (there's still no button for that) — this version is entitlements
management for tenants that already exist, not tenant creation; flagged as a natural
follow-up, not built speculatively.

**Verified:** `npx tsc --noEmit` clean for both `apps/api` and `apps/web`. Applied the
new migration against the user's own existing (pre-v018.A) local Postgres rather than
only a fresh one — confirmed the grandfather backfill actually left `riverbird-demo`
with all 8 modules and no seat cap change. Ran both dev servers and exercised the real
HTTP surface: platform-admin login issues a token; `GET /platform-admin/tenants`
returns accurate entitlements and a live seat count; disabling Payroll for the demo
tenant 403s `GET /payroll/runs` with the intended message while leaving
`GET /leave/types` unaffected, then re-enabling it restores access; lowering the seat
cap to the current headcount makes `POST /employees` 400 with the intended message,
then raising it again un-blocks it. All three new frontend routes
(`/platform-admin/login`, `/platform-admin`, `/platform-admin/tenants/:id`) compile
and return 200 with no server errors; spot-checked `/login` and `/careers/riverbird-demo`
still render, unaffected.

## v019.A — 2026-09-17

Full tenant lifecycle management in Platform Admin (create/edit/activate/deactivate/
delete, not just entitlements), a bit of tmPro brand accent on the previously "plain by
design" platform-admin screens, the demo tenant renamed from Riverbird Technology NZ to
Stockhub Ltd, and self-service password change for every tenant role.

**Tenant lifecycle.** `tenants` gains a `status` column (`ACTIVE` | `INACTIVE`,
`tenant_status` enum) — every tenant that existed before this migration is
grandfathered onto `ACTIVE` (they already have real users signing in today); a tenant
created from here on via "Add Tenant" always starts `INACTIVE` regardless of what the
form sends, and only an explicit Activate moves it to the Active tab. `AuthService.login()`
checks this before the password check at all: an `INACTIVE` tenant's users get
"This organisation is currently inactive. Please contact support." rather than a normal
invalid-credentials error, whether the tenant is brand new or was deliberately
deactivated. Deactivating doesn't delete anything — the tenant and its users stay in
the database, just locked out, and Activating undoes it. Deleting (only ever offered
from the Inactive tab) is permanent: `TenantsAdminService.remove()` is a single
`DELETE FROM tenants WHERE id = $1`, relying on a new migration (`drizzle/0021`) that
adds `ON DELETE CASCADE` to the `tenant_id` foreign key on all 36 tenant-scoped tables
(previously none of them cascaded, so a naive delete would have failed on the first
`employees` row) — verified end to end: created a tenant, activated it, edited it,
deactivated it, then deleted it, and confirmed zero orphaned `users` rows afterward.

**Add Tenant / Edit.** `users` gains nullable `firstName`/`lastName` columns — set for
an ADMIN login created via "Add Tenant" (the platform owner is asking for a name to
show/edit right there in the form), left `null` for logins created any other way (e.g.
seed.ts's supervisor/employee accounts, which already get a name from their linked
`employees` row). "Add Tenant" takes the tenant admin's first name, surname,
organisation name, admin email, and a password, then modules and seat capacity — one
call (`TenantsAdminService.create()`) creates both the tenant row and that first ADMIN
login, rolling the tenant back out if the login insert fails (e.g. a duplicate email)
so a bad submit can't leave an orphaned, login-less tenant behind. The organisation
name is slugified into a unique tenant slug automatically (collisions get `-2`, `-3`,
...). Edit reuses the same form (`tenant-form.tsx`, shared between Add and Edit) to
change the organisation name, the admin's name/email, optionally reset their password,
and the modules/seat cap — every field is independently patchable, so editing modules
doesn't require re-entering a password. The old dedicated `/platform-admin/tenants/:id`
edit page is retired in favor of an inline modal on the main Tenants page (matching
"Add Tenant" being inline too); the route still exists but just redirects to
`/platform-admin`, so an old bookmark doesn't 404.

**Pending Applications.** A new read endpoint (`GET /platform-admin/org-signups`,
`OrgSignupsAdminService`) surfaces every `org_signup_requests` row — the "Register your
organisation" leads — in a third tab. "Create tenant" on a row pre-fills the Add Tenant
form from the lead's name (split into first/last), email, organisation name, and
requested modules (intersected against `MODULE_KEYS`), rather than making the platform
owner retype it.

**Stockhub Ltd rename.** The seeded demo tenant is renamed in place — `riverbird-demo`
→ `stockhub-demo`, "Riverbird Technology NZ (Demo)" → "Stockhub Ltd", and
`organization_settings.name` "Riverbird Technology NZ" → "Stockhub Ltd" — via a data
migration (not just a `seed.ts` change), so a database that already migrated through
v018.A gets renamed too rather than only fresh installs. Kept the same tenant id and
all its seeded data; only the public-facing name and slug change. (The unrelated
"Riverbird Technology Partners" trust-logo on the public login page's marketing strip
is a different, fictional partner name and was deliberately left alone.) README and
`careers/page.tsx`'s default tenant slug updated to match.

**Platform Admin theme.** The platform-admin login and Tenants screens — previously
"deliberately plain, no marketing" — pick up the same `--brand-gradient` tokens the
rest of the app already uses: a thin gradient bar across the top of the login card and
the Tenants header, a gradient "Add Tenant" button, and an accent-colored active-tab
underline. Still no marketing hero or "Register your organisation" link — this stays an
internal operator tool — just no longer flat gray.

**Change password.** Every tenant role (Admin, Supervisor, Employee) can change their
own password from the sidebar: the avatar/email/role block above "Log out" is now a
button that opens a small form (current password, new password, confirm) rather than
being static. New endpoint `POST /auth/change-password` (`JwtAuthGuard`, so it's scoped
to whichever user the caller's own token says they are — there's no way to target
anyone else's password) checks the current password against the stored hash before
accepting the new one, so a momentarily unattended signed-in session can't be hijacked
into a full takeover just by opening the menu. Platform-admin accounts don't get this
yet — out of scope for this version, flagged as a natural follow-up.

**Editable role (Permission tab), follow-up.** A person's Permission tab on the People
profile — previously a read-only "Role: SUPERVISOR, changing isn't available yet" line —
now has a real role dropdown and Save, via a new `PATCH /employees/:id/role`
(`EmployeesService.updateRole()`). It changes the role on that employee's linked `users`
login only; an employee with no login yet just sees "doesn't have a login account yet"
instead of an editor. One guardrail added that the request didn't spell out but seemed
worth building in: the endpoint (and the UI) blocks changing your own role, so a tenant
admin can't accidentally lock themselves out of Admin access with one click — there's no
"last Admin" check beyond that, consistent with this scaffold's generally light-touch
approach to permission edge cases elsewhere.

**HR role, follow-up.** A fourth tenant-side login role, `HR`, sits between Supervisor
and Admin — added to the `role` Postgres enum via `drizzle/0022_hr_role.sql`. The rule
as given: HR gets everything an Admin gets *except* the Organization, Branches,
Departments, and Designations tabs under Settings, which stay Admin-only. Implemented by
removing `SettingsController`'s old class-level `@Roles('ADMIN')` and splitting it
per-endpoint — Organization/Branches/Departments/Sections/Designations stay
`@Roles('ADMIN')`, Leave types and Announcements become `@Roles('ADMIN', 'HR')` — and by
adding `'HR'` alongside `'ADMIN'` on every other `@Roles()` decorator across the app
(People/Employees CRUD and sub-resources, Payroll, Recruitment, Performance, Training
authoring/assignment, Reports, the admin Dashboard summary) plus the matching
service-layer branches (`EmployeesService.findVisible/assertVisible`,
`ReportsService.scopeEmployeeIds`, `LeaveService.decide()`'s "you can only decide your
own reports' leave" bypass) that were checking `role === 'ADMIN'` directly rather than
going through a guard. HR is included in the Permission tab's role-editor dropdown
(`Employee, Supervisor, HR, Admin`, the order requested) and can use it, on the reading
that "has the rest" of Admin's access wasn't called out as excluding this one action —
same self-role-change block applies regardless of who's doing the editing. On the
frontend, `apps/web/src/app/settings/layout.tsx` now renders every Settings tab but
grays out/blocks the four Admin-only ones for HR with an inline "Admin-only" message
instead of hiding them outright (matching what the API actually enforces if someone
still hits the URL directly), and `/settings` itself now lands HR on `/settings/employees`
rather than the Admin-only `/settings/organization` it redirects Admin to. Payroll's tab
nav, the People/Leave/Performance/Requisitions/Training pages' Admin-branches, and the
sidebar's Settings/Recruitment/Reports nav links all treat HR the same as Admin.
Deliberately left alone: `EmployeesService.generateLogins()`'s bulk login creation still
only ever mints Supervisor/Employee accounts (unchanged from v008.A) — HR is something
the platform owner or a tenant Admin assigns deliberately via the Permission tab, not a
role the bulk-generate heuristic guesses at.

**Verified:** `npx tsc --noEmit` clean for both `apps/api` and `apps/web`. Ran both dev
servers and exercised the real HTTP surface: platform-admin login; created a tenant via
`POST /platform-admin/tenants` and confirmed it's `INACTIVE` and its admin's login 401s
with the contact-support message; activated it and confirmed the same login now
succeeds; edited its organisation name, admin name, and admin email, and confirmed the
old email no longer works while the new one does; deactivated it and confirmed the
login 401s again; deleted it and confirmed it's gone from the list with zero orphaned
`users` rows; submitted a public `/org-signup` lead and confirmed it appears in
`GET /platform-admin/org-signups`. For change-password: wrong current password 400s,
correct current password changes it, the old password then fails tenant login while the
new one succeeds, and an unauthenticated call 401s. All touched frontend routes
(`/platform-admin/login`, `/platform-admin`, `/login`, `/dashboard`,
`/careers/stockhub-demo`) compile and return 200 with no server errors. For the role
editor and HR role: ran `drizzle/0022_hr_role.sql` against the sandbox database;
promoted a seeded Supervisor to HR via `PATCH /employees/:id/role` and confirmed the
response and a re-fetch both show `HR`; logged in as that HR account and confirmed live:
`GET /employees` returns the full tenant directory (not just self/team), `GET
/settings/organization`, `/settings/branches`, `/settings/departments`, and
`/settings/designations` all 403, `GET /settings/leave-types`, `/settings/announcements`,
`/payroll/runs`, and `/dashboard/admin-summary` all 200, and `PATCH` on that same HR
user's own role 400s with "You cannot change your own role."; reverted the demo account
back to `SUPERVISOR` afterward so the seed data is unchanged.
