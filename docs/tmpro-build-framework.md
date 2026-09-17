# tmPro — Build Framework

Talent management platform (multi-client HR system): Employee Profiles, Leave & Attendance, Requisitions, Performance Management, Payroll. Self-service logins: Employee, Supervisor, Job Candidate (+ an implicit HR/People Admin tenant-config role).

**Locked assumptions:** payroll scope is global/multi-country from day one; stack is Node.js/TypeScript + React; stage is early-stage, bootstrapped MVP.

This scaffold (in `apps/`) implements Phase 0/Phase 1 of the roadmap below — see the root `README.md` for what's working end-to-end versus scaffolded.

## 1. Users & self-service portals

| Role | Primary jobs | Scope |
|---|---|---|
| Employee | Own profile, leave requests, balances/payslips, self-reviews, org chart | Self only |
| Supervisor | Approve leave/timesheets, raise requisitions, run team reviews, view team payroll cost | Direct + indirect reports |
| Job Candidate | Apply, track status, book interviews, upload docs, e-sign offer | Own application(s) only |
| HR/People Admin (implicit) | Configure tenant, own requisition-to-hire, run/approve payroll, manage policies | Tenant-wide |

Model as **role × scope** permission grid (module, action, scope), not four hard-coded roles — tenants will want custom roles (e.g. Finance: view payroll cost, can't run payroll).

## 2. What to borrow from BambooHR, Deel, peopleHum

- **BambooHR**: nail the plain HRIS core (profiles, leave, docs, org chart) first — it's the retention anchor. Tiered packaging (Essentials → Advantage → add-ons), open API + marketplace.
- **Deel**: don't build 150 countries of tax law yourself — centralize compliance logic behind one internal interface and grow country coverage over time. Applies local tax rules automatically, FX/local payment rails via licensed partners, unified view across employee/contractor/EOR/PEO.
- **peopleHum**: keep modules genuinely separable — a client should be able to run Employee Profiles + Leave without being forced into Performance or Payroll. Named sub-products bundled as one suite (Manage, HirePut, Engage, Plan, Huddle, OKRs, LMS, e-sign, AI chatbot).

**tmPro's synthesis:** BambooHR's simplicity as the core HRIS + peopleHum's modular per-tenant packaging + Deel's discipline of isolating payroll compliance behind an interface.

## 3. Module framework

1. **Employee Profiles** — core system of record every other module references. Client-configurable custom fields via JSONB + per-tenant field-schema table (not per-client DDL). Lifecycle: candidate → onboarding → active → on leave → offboarding → alumni.
2. **Leave & Attendance** — policy/accrual engine (country- and tenant-configurable leave types/rates) + attendance/timesheet layer. Workflow: Employee requests → Supervisor approves → balance updates → Payroll consumes via an event, not a live query.
3. **Requisitions** — the approval object (role, budget, headcount, approval chain) that exists before a job posting. Spawns posting → candidate pipeline → interviews → offer/e-sign. Candidate login lives here, deliberately narrow (own application only). "Hired" hands off into Employee Profiles.
4. **Performance Management** — goals/OKRs, review cycles, feedback. Lowest coupling to other modules; sequence after the transactional modules are solid — adopted last, churned over slowest.
5. **Payroll** — see section 6. The module where "global from day one" and "bootstrapped MVP" are in direct tension.

## 4. Architecture

Modular monolith first: one Node.js/TypeScript service (NestJS), five domain modules each owning their own tables and emitting events — no cross-module SQL joins. Split any module into its own service later once load or team size justifies the operational cost. API layer: REST + OpenAPI, JWT/SSO auth, tenant resolution. Data layer: PostgreSQL (shared schema) + Redis queue (payroll runs, accrual jobs) + object storage (docs/payslips/resumes). Payroll calls out to external payroll/payment partners for non-anchor countries.

## 5. Multi-tenancy & data model

Shared schema (one database, `tenant_id` on every table) — cheapest to run, simplest to back up/migrate, what most SaaS at this stage builds on. Enforced two ways in this scaffold: every service method filters explicitly by `tenantId` (application layer), and Postgres Row-Level Security policies keyed off a `SET LOCAL app.current_tenant_id` session variable are the structural second layer — verified in this build to block cross-tenant reads even for the database owner role. Payroll's country rulesets are a *different* axis of variation (tenant-by-country) — handled by the pluggable pattern in section 6, not the shared-schema model.

## 6. Technology stack (Node/TS + React)

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + TypeScript, Next.js | One framework for marketing site + 3 app shells; SSR helps candidate-facing pages |
| UI | Tailwind + Radix/shadcn | Accessible primitives, skinned once, reused across portals |
| Backend | NestJS | Module/DI structure maps onto the 5 domains — makes a future service split explicit |
| API | REST + OpenAPI | Matches BambooHR/Deel's own API style; easiest for integrations |
| Database | PostgreSQL + Drizzle ORM | RLS, JSONB custom fields, mature managed offerings everywhere. (Swapped in for Prisma during the build — Prisma's engine-binary download was blocked by this environment's egress policy; Drizzle needs no native binary and is equally valid per the framework.) |
| Queue | BullMQ + Redis | Async payroll runs, accrual batches, notifications (scaffolded, not yet wired to a queue in this build — payroll runs synchronously for now) |
| Auth | WorkOS or Auth0 (JWT auth built for this scaffold) | SSO/SCIM/MFA is undifferentiated heavy lifting; want it as a config change when an enterprise client asks |
| Storage | S3-compatible | Signed/expiring URLs, encryption at rest for payslips/contracts/IDs |
| Payments/FX | Partner (Airwallex, Wise Platform, Modern Treasury) | Avoid banking-license exposure — Deel itself uses licensed rails, doesn't build its own |
| Observability | Sentry + OpenTelemetry | Cheap early, expensive to retrofit once payroll needs an audit trail |
| CI/CD | GitHub Actions + Docker | Free tier covers early stage; portable across clouds |

## 7. Global payroll — the hard part

Design a pluggable `PayrollRuleset` interface from day one (tax brackets, statutory leave interaction, retirement contributions, filing format) that the core payroll engine calls without knowing which country it's talking to — that's the "global" part, and it's free to design in early. Then split coverage into tiers:

- **Native** (build first): full in-house ruleset for **NZ** (PAYE, KiwiSaver, ACC) and **AU** (PAYG, Superannuation) — home market and nearest expansion. NZ is implemented in this scaffold (`apps/api/src/modules/payroll/rulesets/nz-payroll-ruleset.ts`) as the first pattern example — illustrative bracket figures, flagged in-code as needing verification against current IRD rates before real use. A second native ruleset, Zambia (ZM — PAYE, NAPSA, National Health Insurance Levy), is also implemented (`zm-payroll-ruleset.ts`) and is the scaffold's default payroll country/currency, reflecting the current tenant's actual operating footprint; NZ stays fully implemented and selectable on every payroll run.
- **Partnered** (wrap, don't build): route pay runs for every other country through an EOR/global-payroll API partner (Deel's API, Remote, Papaya Global, etc.) behind the same interface — tmPro owns UX/data model/approval workflow, the partner owns statutory calculation and filing.
- **Future native**: graduate a country from Partnered to Native once tenant demand justifies the build/maintenance cost.

This makes "global payroll" honest on day one without betting the MVP on becoming a compliance-law company before validating the core HRIS.

Core entities: `PayRun` (execution for a tenant + period, with an approval gate before disbursement), `Payslip`, `TaxProfile` (versioned — people move countries, brackets change yearly). Run every PayRun as an async job with an immutable audit log (this scaffold runs it synchronously within the request for simplicity — move to the BullMQ queue before production use).

## 8. Hosting: AWS vs GCP vs Azure

| | AWS | GCP | Azure |
|---|---|---|---|
| Managed Postgres | RDS/Aurora | Cloud SQL | Azure Database for PostgreSQL |
| Ease of use, small team | 200+ services, genuinely overwhelming solo | Fewer options, cleanest console | Smoothest if already on Microsoft 365/Entra ID |
| Cost discipline | Savings plans need manual setup; watch NAT gateway (~$32–45/mo) and LB (~$18–25/mo) | Sustained-use discounts apply automatically (up to ~30% after 25% monthly usage) | Comparable to AWS; enterprise agreements can undercut at volume |
| Region footprint | Broadest (30+ regions) — matters for payroll data residency | Fewer regions | Strong, especially EU |
| Startup credits (2026, indicative — verify current terms) | Activate: ~$1–5k self-funded; up to ~$100–200k VC/accelerator-backed | Up to ~$2k unfunded; up to ~$200k (~$350k AI-first) with verifiable equity funding, phased over 2 years | $200 no-code entry; up to ~$150k unlocked against verified usage |

**Recommendation:** start on a zero-ops PaaS (Render, Railway, or Fly.io) for the first working version — Dockerized Node/TS app + managed Postgres, deployable in an afternoon, near-zero cost at low traffic. Move to **AWS** once there are paying tenants and payroll data residency starts to matter — its region breadth is the deciding factor for a genuinely global payroll product. Treat GCP as the fallback if AWS's surface area proves too much for a small team. Reserve Azure for when an enterprise prospect specifically requires it (common in NZ/AU government/education procurement).

## 9. Phased roadmap

- **Phase 0** (~M0–1.5): discovery, service skeleton, auth, CI/CD. ✅ done in this scaffold.
- **Phase 1** (~M1.5–4): Core HRIS — Employee Profiles + Leave & Attendance + native payroll (NZ and ZM). ✅ working end-to-end in this scaffold. Ship to design-partner clients before Requisitions/Performance exist.
- **Phase 2** (~M4–7): Requisitions + Candidate portal + AU native payroll. 🚧 Requisitions/Candidate apply flow scaffolded; AU ruleset not yet built.
- **Phase 3** (~M7–10): Performance Management + partnered global payroll countries. 🚧 goal-setting scaffolded; review cycles and partner integration not yet built.
- **Phase 4** (~M10+): scale hardening — SOC2 readiness, multi-region, enterprise SSO, dedicated infra for large tenants. Not started.

Payroll stays "partnered" through Phase 3; only graduate a country to native once demand justifies it.

## 10. Open decisions before Phase 0

- Pick the first global-payroll partner to integrate behind `PayrollRuleset` — a vendor/commercial call, gates how "global" the launch claim can honestly be.
- Confirm WorkOS vs Auth0 vs self-rolled auth against actual first-client SSO needs — don't over-buy before a client asks.
- Define the explicit PaaS→AWS migration trigger (e.g. first non-NZ/AU paying tenant, or first client-mandated data-residency requirement).
- Name Phase 1 design-partner clients — the custom-fields and permission-grid design will sharpen fast against real client policy documents.
