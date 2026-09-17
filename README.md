# tmPro

**Current version: v017.A** — the login hero graphic, "Register your
organisation", and a real public careers site, all in one batch. The
low-resolution login screenshot is gone, replaced by a resolution-independent
React composite (the approved "Version 1 — Moderate shift" layout) on a
fixed deep-navy/brand-glow background (the approved "Version 4"). "Register
your organisation" is now a real form (name, email, org name, country,
staff complement, feature checkboxes) posting to a new public
`POST /org-signup`, which just records a lead — tmPro has no self-serve
tenant provisioning yet. "Go to the careers page" now goes somewhere: an
`APPROVED` requisition doubles as a live job ad on a new
`/careers/[tenantSlug]` job board (tenant logo/name, keyword/location
filter, tmPro-themed like the reference job-board image) and
`/careers/[tenantSlug]/[jobId]` detail page (Your Role / What you'll do /
What you'll bring / What you'll get / Why Us, plus an Apply form feeding
the existing public apply endpoint). The internal Requisitions page gained
Employment Type/Location fields and a "Public listing" editor so these are
actually fillable, not just backend-ready. **Requires a database migration**
(`npm run db:migrate` in `apps/api`) — a new `org_signup_requests` table
plus eight new public-content columns on `requisitions`. See
`docs/VERSION-LOG.md` for full detail. Builds on v016.B — a bug fix for
v016.A's login, reported immediately by the user: `POST /auth/identify`
returned "We couldn't find an account with that email." for every email on
a non-superuser Postgres role (i.e. any setup other than the docker-compose
default), because its cross-tenant read ran outside Row-Level Security's
tenant scoping and `FORCE ROW LEVEL SECURITY` silently emptied the result.
Required a database migration — a new, narrowly-scoped RLS policy on the
four tables `identify()` reads, gated on "no tenant context is set" so it
only ever applies to that one pre-authentication lookup, not to any normal
tenant-scoped query. See `docs/VERSION-LOG.md` for full detail. Builds on
v016.A — identifier-first
login. **Required a database migration** (`npm run db:migrate` in
`apps/api`) — replaces the case-sensitive `(tenant_id, email)` unique index
on `users` with a case-insensitive one. The "Organization" field is gone
from sign-in; instead a `POST /auth/identify` endpoint resolves which
tenant(s) an email belongs to (case-insensitively, rate-limited against
enumeration), and the login page is now a 3-step flow — email, then an org
picker only if that email is shared across more than one tenant, then a
password screen with the resolved org's logo/name locked in and a
"Welcome back" greeting when a name is available. Email matching is
case-insensitive everywhere now, not just here. See `docs/VERSION-LOG.md`
for full detail. Builds on v015.A — three corrections to the leave accrual engine
plus a new Training / LMS module. **Required a database migration**
(`npm run db:migrate` in `apps/api`) — four new tables (`courses`,
`course_quiz_questions`, `course_quiz_options`, `course_assignments`).
The leave accrual cycle now anchors to the Job tab's Employee Status
Effective Date (not Compensation, which stays what Payroll itself anchors
to); every leave type other than Annual Leave is granted in full as soon
as its annual cycle begins rather than accruing gradually; and
Paternity/Maternity Leave are now gender-restricted off the Gender field
on General Info. The Dashboard's own leave-balance widget now shows only
Annual Leave plus any type actually applied for, in a small sticky
far-right column instead of the full nine-type catalog at zero. Training
is a full new module: Settings → Training lets an Admin add a course
(image, title, a YouTube-embeddable URL), author an MCQ quiz for it, and
Publish it; the Training sidebar page gained a "My Courses" grid (status,
score, an in-page video player with a quiz or a manual complete) and an
"Assign Courses" panel for Supervisors/Admins to allocate published
courses to staff. See `docs/VERSION-LOG.md` for full detail. Builds on
v014.A — a configurable, per-country leave-accrual system plus a
redesigned login screen. **Required a database migration**
(`npm run db:migrate` in `apps/api`) — two new `leave_types` columns
(`accrual_period`, `carry_over_enabled`) and a widened `country_code`.
Settings → Leave (Admin-only) is a country-regime dropdown (Zambia,
Malawi, South Africa — Native, or Other) over an editable table of the
9-type leave catalog (Days Accrued / Accrual Period / Carry-Over per row,
Public Holidays excluded). The login screen became a split layout — a
brand-gradient marketing panel (headline, feature list, a People-directory
screenshot) beside a white sign-in panel (a triangular cluster of three
ring portraits, the form, and a "Trusted by" partner-logo strip) — with
all existing login functionality unchanged underneath. See
`docs/VERSION-LOG.md` for full detail. Builds on v013.E — a
four-instruction batch, no migration needed. The seeded demo employees are
now Zambian (Bupe Zulu, Kunda Phiri — ZM/Lusaka) with login emails on the
real `stockhub.net` domain
(`admin@stockhub.net`/`priya@stockhub.net`/`sam@stockhub.net`); the Job
tab's four history sections (Status, Employment Type, Compensation, Job
Information) gained Admin-only delete alongside the existing edit-in-place;
the Additions & Deductions employee picker is a closed dropdown instead of
an always-open scrolling checkbox box; and the Employee/Supervisor "Your
payslips" page is now a Month/Year picker (restricted to periods that
already have a payslip on file) plus a "View Payslip" button, showing one
payslip at a time with Print instead of stacking every payslip the person
has ever had. See `docs/VERSION-LOG.md` for full detail. Builds on
v013.D — a payroll **proration engine**: earnings are now
resolved day-by-day against the pay period rather than from one flat
snapshot, so a single run correctly handles a new hire starting mid-period,
someone leaving or being terminated mid-period, a mid-month salary increase
or promotion, unpaid leave, a change in contracted hours, a switch between
hourly and salaried pay, and employees joining/leaving during a short month
like February — all from the same mechanism, with the exact same tax code
in ZM's and NZ's rulesets untouched. Every payslip now shows a "Prorated —
paid for X of Y days" note whenever it isn't a full period. **Required a
database migration** (`npm run db:migrate` in `apps/api`) before that
build's payroll would run — two new columns
(`employee_compensation_history.hours_per_week`,
`leave_types.is_paid`) back the engine. See `docs/VERSION-LOG.md` for full
detail, including two called-out gaps: NZ's tax-bracket annualization for a
partial period is a known simplification, and Leave Types (including the
new "unpaid" flag) still have no Settings UI — seed/DB-managed only.
Builds on v013.C — a payroll bug fix: MONTHLY-paid employees' Basic Salary
was being re-scaled by the pay period's day count against a 30.44-day
average month, silently underpaying every full-month run by ~4.7%; MONTHLY
no longer scales by day count for a full period at all (day-by-day
proration in v013.D generalizes this same fix to every partial-period
case too). Builds on v013.B — a three-instruction
follow-up: the Dashboard's headline stat tiles (Headcount/Departments/
Pending Requests) are now thick rings instead of teardrops, the Midnight
theme's sidebar gradient is a more dramatic deep-blue-to-black spread
instead of a fairly flat navy, and the Payroll page's explanatory
sub-heading paragraph is gone — the page now opens straight into the tab
strip. Builds on v013.A — a second, switchable theme (Settings-free —
toggled from a small switch at the bottom of the sidebar), modeled on a
reference fintech-dashboard screenshot: dark-navy sidebar, white canvas,
blue accent, and a rounder geometric font (Plus Jakarta Sans). The original
tmPro brand look is untouched and stays the default; the whole app re-skins
through CSS custom properties layered onto the existing `ink`/`accent`/
`chrome.*`/`sidebar-gradient`/`brand-gradient`/`shadow-card` Tailwind
tokens already used everywhere, so no page had to change. The choice
persists per-browser and survives reloads with no flash of the other theme.
Builds on v012.A — an
eleven-instruction batch: Organization/
Branches now use structured addresses (Street/Town-City/Province/Country)
instead of free text; Job Information's Location is a dropdown drawn from
the tenant's Branches instead of typed freely, auto-computing the stored
location string; the Job tab's four history sections (Status, Employment
Type, Job Information, Compensation) now render as most-recent-first tables,
with Compensation showing a computed Gross Pay column; every tab under a
People profile — Job history, Work Experience, Education, Dependents,
Performance Reviews/Comments, Documents — is now editable (and Documents
renamable) in place, not just addable; Payroll is now three tabs (Pay Runs /
Additions & Deductions / Regulatory Submission); payslip "Download PDF" is
now a native browser Print; payroll eligibility now follows a Compensation
entry's Effective Date instead of the employee's Start Date; Organization
Settings gained Superannuation No./Tax ID/Health Insurance ID, and Staff
Basic Info replaced Driver Licence with ID No. plus new Social Security No./
Health Insurance No. (all flowing through to the payslip); executed payroll
runs are now editable and deletable (with best-effort adjustment rollback);
and a new Regulatory Submission tab generates Superannuation/PAYE/Health
Insurance return files (with CSV export) for any period payroll has actually
run, from real payslip data. See `docs/VERSION-LOG.md` for full detail,
including two documented scope gaps (Middle Name, PAYE Total Tax Credit/Tax
Adjusted) called out directly in that tab's own UI copy. Builds on v011.A's
three-instruction batch: the Job tab's Compensation section became one
unified, country-agnostic form for every employee (no more NZ-only vs
ZM-only styling) — a Currency dropdown (defaults to the Organization's
currency, independently adjustable), Basic Pay Rate + Pay Type, and a
repeatable Allowances list (Housing/Transport-Vehicle/Meal-Lunch/Other, each
with an amount and optional note), alongside the retained Change
Reason/Effective Date/Comment; every native payroll ruleset (NZ and ZM) now
computes gross pay from that same Basic-Pay-Rate-plus-Allowances shape
instead of NZ's old standalone Annual Salary field, and as a byproduct NZ
payslips also render the full "Pay Advice"-style breakdown previously
exclusive to ZM; and every still-pending Additions/Deductions adjustment on
the Payroll page can be edited in place (not just cancelled), with
guardrails preventing its occurrence count from being dropped below what's
already been applied. Builds on v010.A's batch of six:
the Organization's Currency setting
is now a searchable dropdown of every live ISO 4217 currency (via `Intl`), and
drives money formatting across Payroll and every employee salary/compensation
figure for every role; Zambia (ZM) is now the default native payroll
country/currency for new tenants (NZ stays fully implemented and selectable on
every payroll run — nothing about the seeded demo tenant's real NZ/ZM staff
changed); Employees and Supervisors can now view their own payslips in-app and
download each as a PDF; Admins get a per-run payroll summary (one line per
employee) that expands into that employee's full payslip, plus a new
Additions/Deductions panel to schedule one-off or multi-run adjustments (an
advance clawed back over several runs, a bonus paid once) that apply
automatically the next time payroll runs for that employee's country; the
sidebar can now be collapsed to icon-only via an arrow toggle, persisted per
browser; and Branches, Designations, and Announcements are now all editable
(not just creatable/deletable) from their Settings pages. Builds on v009.A's
email notifications for leave requests/decisions, announcements, and employee
detail changes, sent through a new provider-agnostic
`MailService` (any SMTP relay — Resend, SendGrid, Postmark, etc. — via one
`nodemailer` transport) that falls back to a dev-mode console logger when no
`SMTP_HOST` is configured, so it works out of the box with no provider chosen
yet. Builds on v008.A's bulk "Generate logins" action on Settings →
Employees (Admin-only): creates a sign-in for every employee who doesn't have one
yet, keyed on their personal email, Supervisor if anyone reports to them and
Employee otherwise, all sharing one default password. Builds on v007.A's batch of
six enhancements: the Organization's
Currency setting now drives money formatting everywhere financial (Payroll,
payslips); Admin and Supervisor dashboards gained headline summary panels (large
"teardrop" stat tiles for Headcount/Departments/Pending Requests, plus staff
on/about-to-go-on leave, pending requests, and upcoming birthdays, scoped to direct
reports for Supervisors); a new Reports page with six report types (leave days
accumulated, goals set, appraisals conducted, unresponded requests per supervisor,
contract/ID copies not on file), each with a date-range filter; the Employee
dashboard gained leave-taken-vs-total, unread announcements (with read-tracking),
and unapproved-requests widgets; and a dashboard-avatar bug fix so an uploaded
portrait actually shows up there. Employee payslip self-service (view your own
payslips under Payroll) was confirmed already working from v006.A. Builds on
v006.A's batch of seven (reference-data dropdowns, employee portrait + organization
logo uploads with a branded sidebar header, downloadable sample CSVs, a Documents
module, a native Zambia (ZM) payroll ruleset with a full Pay Advice-style payslip,
and a downloadable Org Chart PDF), v005.A's People profile rebuild (General Info,
Job, Performance, and Leave tabs field-complete and Admin-editable), v004.A's
role-scoped People directory and Admin-only **Settings** section (Organization,
Branches, Departments + Sections, Employees, Designations, Announcements, Org
Chart — each with CRUD and CSV **Data Import**), v003.A's People directory and
profile tabs, v002.A's tmPro brand redesign (logo, "your talent.unified" tagline,
sidebar shell, avatars), and v001.A's functional scaffold. See
`docs/VERSION-LOG.md` for the full version history.

Talent management platform — multi-client HR system. Backend (`apps/api`) is a NestJS
modular monolith over PostgreSQL (Drizzle ORM), frontend (`apps/web`) is Next.js/React.
Architecture and rationale: see `docs/tmpro-build-framework.md`.

This is a Phase 0/Phase 1 scaffold per the roadmap in that doc:

- **Working end-to-end:** auth, multi-tenancy, Employee Profiles, Leave & Attendance
  (request → approve → balance update), Documents (Contract/ID/Other uploads).
- **Scaffolded (compiling, basic CRUD, not full business logic yet):** Requisitions,
  Performance Management, Payroll (working native `PayrollRuleset`s for ZM — the
  default — and NZ as the pattern examples for the pluggable country-ruleset
  design; NZ stays selectable on every payroll run).

## Prerequisites

- Node.js 20+
- PostgreSQL (local install or `docker compose up -d` for Postgres + Redis)

## Quick start

```bash
# 1. Start Postgres (docker compose up -d, or point DATABASE_URL at your own install)

# 2. Backend
cd apps/api
cp .env.example .env
npm install
npm run db:migrate
npm run seed
npm run start:dev
# API on http://localhost:3001

# 3. Frontend (new terminal)
cd apps/web
cp .env.example .env.local
npm install
npm run dev
# Web on http://localhost:3000
```

## Demo login

The seed script creates one tenant (`stockhub-demo`) with:

| Email | Role | Password |
|---|---|---|
| `admin@stockhub.net` | HR Admin | `Passw0rd!` |
| `priya@stockhub.net` | Supervisor — Bupe Zulu | `Passw0rd!` |
| `sam@stockhub.net` | Employee — Kunda Phiri | `Passw0rd!` |

Bupe and Kunda are seeded as Zambian (ZM) employees. Kunda reports to Bupe and has a
pending leave request waiting for approval — log in via `priya@stockhub.net` to see
the working approve flow, or `sam@stockhub.net` to see balances and submit a new
request.

The seed script also publishes four open roles — no login needed, this is the public
careers site: [`/careers/stockhub-demo`](http://localhost:3000/careers/stockhub-demo).

## Platform Admin

`/platform-admin` (separate login, separate from any tenant's own ADMIN account) is
where the tmPro *operator* — not a tenant — provisions and manages tenants: which of
tmPro's 8 modules each one can use, an optional cap on active employee seats, and
(v019.A) each tenant's own admin login and active/inactive status. The seed script
creates one platform-admin account:

| Email | Password |
|---|---|
| `owner@tmpro.app` | `Passw0rd!` |

The Tenants screen has three tabs:

- **Active Tenants** — tenants that can sign in today. Edit (organisation name, admin
  name/email/password, modules, seat cap) or Deactivate (moves it to Inactive — its
  users stay in the database, but `/auth/login` refuses them with a "contact support"
  message until it's reactivated).
- **Inactive Tenants** — includes every tenant just created via "Add Tenant" (new
  tenants always start here, never Active, until the platform owner explicitly
  activates them). Edit, Activate, or Delete (permanent — cascades to every row that
  belonged to the tenant, via `ON DELETE CASCADE` added in `drizzle/0021`).
- **Pending Applications** — leads from the public "Register your organisation" form
  (`org_signup_requests`), for the platform owner's attention. "Create tenant" on a row
  pre-fills the Add Tenant form from the lead's name/email/organisation/requested
  modules.

"Add Tenant" asks for the tenant admin's first name, surname, the organisation name,
an admin email + password, then modules and seat capacity — it creates the tenant row
*and* that first ADMIN login in one step.

`stockhub-demo` is seeded ACTIVE with every module enabled and a seat cap of 25 (well
above the couple of employees the seed script creates directly), so you can see what
*disabling* a module or lowering the cap looks like without breaking the rest of the
demo. See `apps/api/src/common/modules/module-catalog.ts` for the module list and which
ones are actually enforced (`ModuleGuard`) versus just recorded for now.

## Changing your password

Every signed-in user (Admin, Supervisor, or Employee) can change their own password
from the sidebar: click the avatar/email/role block above "Log out" to open a small
"Change password" form (current password, new password, confirm). This is separate
from `/platform-admin`'s own login, which has no self-service password change yet.

## Multi-tenancy

Every tenant-scoped table carries `tenantId`. The API resolves the tenant per request
from the `x-tenant-slug` header (set automatically by the web app after login), and every
service method filters explicitly by `tenantId` — see `apps/api/src/db/client.ts`
(`withTenant`). Postgres Row-Level Security policies in `apps/api/drizzle/0002_rls.sql`
are the second layer of defence, so a missing filter in application code still can't leak
another tenant's rows.

## Repo layout

```
apps/
  api/     NestJS backend — one module per domain (employees, leave, requisitions,
           performance, payroll), Drizzle schema + migrations, seed script
  web/     Next.js frontend — employee/supervisor/admin portal
docs/
  tmpro-build-framework.md   the architecture & rationale doc this scaffold follows
  VERSION-LOG.md             version history (starts at v001.A)
docker-compose.yml           local Postgres + Redis (optional — see Prerequisites)
```

## What's next (per the roadmap)

1. Requisitions now has a public careers site (job board + job detail + apply, as of
   v017.A) and the Apply-created candidate row lands at stage `APPLIED`. Still open:
   moving a candidate through Screening → Interview → Offer → Hired, and a
   self-service portal for a candidate to track their own application.
2. Fill out Performance Management (goals, review cycles).
3. Wire Payroll's `PayrollRuleset` interface to a partner API (Deel/Remote/Papaya) for
   non-NZ/AU countries, per the framework doc's "native vs partnered" tiering.
4. Swap the demo JWT auth for WorkOS/Auth0 once SSO is needed.
