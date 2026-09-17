import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { db, pool, withTenant } from './client';
import {
  tenants,
  users,
  employees,
  leaveTypes,
  leaveBalances,
  leaveRequests,
  organizationSettings,
  branches,
  departments,
  sections,
  designations,
  courses,
  courseQuizQuestions,
  courseQuizOptions,
  courseAssignments,
  requisitions,
  platformAdmins,
} from './schema';
import { ALL_MODULE_KEYS } from '../common/modules/module-catalog';

const DEMO_PASSWORD = 'Passw0rd!';
const PLATFORM_ADMIN_EMAIL = 'owner@tmpro.app';
const PLATFORM_ADMIN_PASSWORD = 'Passw0rd!';
// Generous but not unlimited, so the seeded demo tenant actually
// demonstrates the seat cap (Settings > stockhub-demo in Platform Admin)
// rather than just showing "unlimited" — well above the ~2 employees this
// script seeds directly.
const DEMO_SEAT_CAP = 25;

async function main() {
  console.log('Seeding demo tenant...');

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const [tenant] = await db
    .insert(tenants)
    .values({
      slug: 'stockhub-demo',
      name: 'Stockhub Ltd',
      enabledModules: ALL_MODULE_KEYS,
      seatCap: DEMO_SEAT_CAP,
      // v019.A: new tenants default to INACTIVE until the platform owner
      // activates them — but the seeded demo tenant needs to be usable
      // right away, so seed it straight into ACTIVE.
      status: 'ACTIVE',
    })
    .onConflictDoNothing()
    .returning();

  const tenantRow =
    tenant ?? (await db.select().from(tenants).then((rows) => rows.find((t) => t.slug === 'stockhub-demo')));
  if (!tenantRow) throw new Error('Could not create or find demo tenant.');

  // Platform-admin login (v018.A) — untenanted, same as `tenants` itself;
  // this is the account that signs in at /platform-admin to manage every
  // tenant's module entitlements and seat cap, not a tenant's own ADMIN.
  await db
    .insert(platformAdmins)
    .values({
      email: PLATFORM_ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(PLATFORM_ADMIN_PASSWORD, 10),
      name: 'tmPro Platform Owner',
    })
    .onConflictDoNothing();

  await withTenant(tenantRow.id, async (tx) => {
    // --- Organization settings -------------------------------------------
    await tx
      .insert(organizationSettings)
      .values({
        tenantId: tenantRow.id,
        name: 'Stockhub Ltd',
        tagline: 'your talent.unified',
        street: '1 Queen Street',
        townCity: 'Auckland',
        province: 'Auckland',
        country: 'New Zealand',
        currency: 'NZD',
        workingHoursStart: '09:00',
        workingHoursEnd: '17:30',
        timezone: 'Pacific/Auckland',
      })
      .onConflictDoNothing();

    // --- Branches, Departments/Sections, Designations ---------------------
    const [headOffice] = await tx
      .insert(branches)
      .values({
        tenantId: tenantRow.id,
        name: 'Auckland Head Office',
        isHeadOffice: 1,
        street: '1 Queen Street',
        townCity: 'Auckland',
        province: 'Auckland',
        country: 'New Zealand',
      })
      .returning();

    const [engineering] = await tx
      .insert(departments)
      .values({ tenantId: tenantRow.id, name: 'Engineering' })
      .returning();

    const [platformSection] = await tx
      .insert(sections)
      .values({ tenantId: tenantRow.id, departmentId: engineering.id, name: 'Platform' })
      .returning();

    const [supervisorDesignation] = await tx
      .insert(designations)
      .values({ tenantId: tenantRow.id, title: 'Engineering Supervisor' })
      .returning();
    const [engineerDesignation] = await tx
      .insert(designations)
      .values({ tenantId: tenantRow.id, title: 'Software Engineer', reportsToDesignationId: supervisorDesignation.id })
      .returning();

    // --- Employees -----------------------------------------------------
    // Demo employees are Zambian nationals (native to this build's default
    // payroll country) working out of the Auckland head office; their login
    // emails use the company's real stockhub.net domain.
    const [bupe] = await tx
      .insert(employees)
      .values({
        tenantId: tenantRow.id,
        employeeCode: 'RBT001',
        firstName: 'Bupe',
        lastName: 'Zulu',
        jobTitle: 'Engineering Supervisor',
        department: 'Engineering',
        countryCode: 'ZM',
        status: 'ACTIVE',
        annualSalary: 128_000,
        branchId: headOffice.id,
        departmentId: engineering.id,
        sectionId: platformSection.id,
        designationId: supervisorDesignation.id,
        employmentType: 'FULL_TIME',
        email: 'bupe.zulu.personal@example.com',
        mobileNo: '+260 97 555 0101',
        city: 'Lusaka',
        country: 'Zambia',
        gender: 'FEMALE',
      })
      .returning();

    const [kunda] = await tx
      .insert(employees)
      .values({
        tenantId: tenantRow.id,
        employeeCode: 'RBT002',
        firstName: 'Kunda',
        lastName: 'Phiri',
        jobTitle: 'Software Engineer',
        department: 'Engineering',
        countryCode: 'ZM',
        status: 'ACTIVE',
        managerId: bupe.id,
        annualSalary: 96_000,
        branchId: headOffice.id,
        departmentId: engineering.id,
        sectionId: platformSection.id,
        designationId: engineerDesignation.id,
        employmentType: 'FULL_TIME',
        email: 'kunda.phiri.personal@example.com',
        mobileNo: '+260 97 555 0102',
        city: 'Lusaka',
        country: 'Zambia',
        gender: 'MALE',
      })
      .returning();

    // --- Users (logins) --------------------------------------------------
    // onConflictDoNothing: idempotent against (tenant_id, email) so re-running
    // seed against a partially-seeded dev DB doesn't blow up.
    await tx.insert(users).values([
      {
        tenantId: tenantRow.id,
        email: 'admin@stockhub.net',
        passwordHash,
        role: 'ADMIN',
        // v019.A: not linked to an employee row, so firstName/lastName are
        // this admin's only stored name — same fields TenantsAdminService
        // sets from the platform-admin "Add Tenant" form.
        firstName: 'Mutale',
        lastName: 'Banda',
      },
      {
        tenantId: tenantRow.id,
        email: 'priya@stockhub.net',
        passwordHash,
        role: 'SUPERVISOR',
        employeeId: bupe.id,
      },
      {
        tenantId: tenantRow.id,
        email: 'sam@stockhub.net',
        passwordHash,
        role: 'EMPLOYEE',
        employeeId: kunda.id,
      },
    ]).onConflictDoNothing();

    // --- Leave types & balances ---------------------------------------------
    // The full Zambia (ZM) catalog — bupe and kunda are both seeded as ZM
    // employees, so this is what their Leave tab and the pending request
    // below actually read. Settings → Leave (Admin) is where these are
    // configured day-to-day now; this is just the same catalog with the
    // statutory-baseline starting figures already filled in, so the demo
    // tenant works out of the box. Public Holidays is deliberately not a
    // row here — it's a calendar concept, not a balance-tracked leave type.
    // `leaveBalances` rows below are just a starting point too: every read
    // of `/leave/my-balances` recomputes them fresh from each type's
    // accrual settings (leave.service.ts's `syncLeaveBalances`), so these
    // numbers self-correct the first time anyone actually opens the page.
    const zmLeaveTypeSeed: Array<{
      name: string;
      isPaid: boolean;
      defaultAnnualDays: number;
      accrualPeriod: 'DAILY' | 'MONTHLY' | 'ANNUALLY';
      carryOverEnabled: boolean;
    }> = [
      { name: 'Annual Leave', isPaid: true, defaultAnnualDays: 2, accrualPeriod: 'MONTHLY', carryOverEnabled: true },
      { name: 'Sick Leave – Long-term Contract', isPaid: true, defaultAnnualDays: 90, accrualPeriod: 'ANNUALLY', carryOverEnabled: false },
      { name: 'Sick Leave – Short-term Contract', isPaid: true, defaultAnnualDays: 52, accrualPeriod: 'ANNUALLY', carryOverEnabled: false },
      { name: 'Maternity Leave', isPaid: true, defaultAnnualDays: 98, accrualPeriod: 'ANNUALLY', carryOverEnabled: false },
      { name: 'Paternity Leave', isPaid: true, defaultAnnualDays: 5, accrualPeriod: 'ANNUALLY', carryOverEnabled: false },
      { name: 'Compassionate/Special Leave', isPaid: true, defaultAnnualDays: 7, accrualPeriod: 'ANNUALLY', carryOverEnabled: false },
      { name: 'Study Leave', isPaid: true, defaultAnnualDays: 10, accrualPeriod: 'ANNUALLY', carryOverEnabled: false },
      // Unpaid Leave — the leave type payroll's proration engine reads
      // (leaveTypes.isPaid = false) to deduct specific approved-leave days
      // from an otherwise-ACTIVE employee's pay.
      { name: 'Unpaid Leave', isPaid: false, defaultAnnualDays: 0, accrualPeriod: 'ANNUALLY', carryOverEnabled: false },
      { name: 'Other Leave', isPaid: true, defaultAnnualDays: 0, accrualPeriod: 'ANNUALLY', carryOverEnabled: false },
    ];
    const zmLeaveTypes = await tx
      .insert(leaveTypes)
      .values(zmLeaveTypeSeed.map((r) => ({ tenantId: tenantRow.id, countryCode: 'ZM', ...r })))
      .returning();
    const annual = zmLeaveTypes.find((r) => r.name === 'Annual Leave')!;
    const sick = zmLeaveTypes.find((r) => r.name === 'Sick Leave – Short-term Contract')!;

    for (const emp of [bupe, kunda]) {
      await tx.insert(leaveBalances).values([
        { tenantId: tenantRow.id, employeeId: emp.id, leaveTypeId: annual.id, balanceDays: 2 },
        { tenantId: tenantRow.id, employeeId: emp.id, leaveTypeId: sick.id, balanceDays: 52 },
      ]);
    }

    // --- A pending leave request, ready for Bupe to approve ---------------
    await tx.insert(leaveRequests).values({
      tenantId: tenantRow.id,
      employeeId: kunda.id,
      leaveTypeId: annual.id,
      startDate: new Date('2026-10-05'),
      endDate: new Date('2026-10-09'),
      days: 5,
      reason: 'Family trip',
      status: 'PENDING',
    });

    // --- Training: one published course (with a quiz) and one draft ------
    // Demonstrates the whole flow out of the box: Kunda has a PENDING
    // assignment waiting on his "My Courses", and Bupe (as Admin/Supervisor)
    // has a second, unpublished course to try Publish + Assign Courses on.
    const [safetyCourse] = await tx
      .insert(courses)
      .values({
        tenantId: tenantRow.id,
        title: 'Workplace Health & Safety Induction',
        courseUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        published: true,
        createdById: bupe.id,
      })
      .returning();

    const [q1] = await tx
      .insert(courseQuizQuestions)
      .values({ tenantId: tenantRow.id, courseId: safetyCourse.id, question: 'Who should you notify first after a workplace injury?', sortOrder: 0 })
      .returning();
    await tx.insert(courseQuizOptions).values([
      { tenantId: tenantRow.id, questionId: q1.id, optionText: 'Your supervisor or first-aider', isCorrect: true, sortOrder: 0 },
      { tenantId: tenantRow.id, questionId: q1.id, optionText: 'No one, just keep working', isCorrect: false, sortOrder: 1 },
      { tenantId: tenantRow.id, questionId: q1.id, optionText: 'Post about it on social media', isCorrect: false, sortOrder: 2 },
    ]);
    const [q2] = await tx
      .insert(courseQuizQuestions)
      .values({ tenantId: tenantRow.id, courseId: safetyCourse.id, question: 'How often should fire exits be kept clear?', sortOrder: 1 })
      .returning();
    await tx.insert(courseQuizOptions).values([
      { tenantId: tenantRow.id, questionId: q2.id, optionText: 'Only during fire drills', isCorrect: false, sortOrder: 0 },
      { tenantId: tenantRow.id, questionId: q2.id, optionText: 'At all times', isCorrect: true, sortOrder: 1 },
      { tenantId: tenantRow.id, questionId: q2.id, optionText: 'Once a month', isCorrect: false, sortOrder: 2 },
    ]);

    await tx.insert(courses).values({
      tenantId: tenantRow.id,
      title: 'Advanced Excel for Reporting (Draft)',
      courseUrl: 'https://www.youtube.com/watch?v=Vl0H-qTclOg',
      published: false,
      createdById: bupe.id,
    });

    await tx.insert(courseAssignments).values({
      tenantId: tenantRow.id,
      courseId: safetyCourse.id,
      employeeId: kunda.id,
      assignedById: bupe.id,
      status: 'PENDING',
    });

    // --- Recruitment: open roles for the public careers page ---------------
    // APPROVED + publishedAt set, so /careers/stockhub-demo shows these
    // immediately — see CareersService (only APPROVED requisitions are
    // public) and RequisitionsService.approve (what normally sets publishedAt).
    const openRoles: Array<{
      title: string;
      department: string;
      employmentType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN';
      location: string;
      roleSummary: string;
      whatYoullDo: string;
      whatYoullBring: string;
      whatYoullGet: string;
      whyUs: string;
    }> = [
      {
        title: 'Senior Software Engineer',
        department: 'Engineering',
        employmentType: 'FULL_TIME',
        location: 'Auckland, NZ',
        roleSummary:
          "You'll help build the platform features that HR teams across several countries rely on every day — from payroll rule engines to the people-data core everything else is built on.",
        whatYoullDo:
          'Design and ship features across the product, from database schema to UI. Pair with the rest of the Platform team on hard problems — multi-tenant data isolation, country-specific payroll rules, reporting performance. Review code, mentor engineers newer to the team, and help keep our test suite honest.',
        whatYoullBring:
          "Several years building production web applications. Comfort with relational databases and API design. A track record of shipping — and a habit of leaving code (and docs) better than you found them. Experience in HR tech or payroll isn't required, just useful.",
        whatYoullGet:
          'Competitive salary, flexible hours, and a small team where your work visibly matters. Hybrid-friendly Auckland office. Learning budget for courses and conferences.',
        whyUs:
          "We're building the HR system we wished existed at our last jobs — configurable enough for a business in any country, without the enterprise-software bloat. Small team, real ownership, customers who tell us exactly what they need next.",
      },
      {
        title: 'Payroll & Compliance Specialist',
        department: 'Finance',
        employmentType: 'FULL_TIME',
        location: 'Auckland, NZ',
        roleSummary:
          "You'll own payroll accuracy and statutory compliance for our own team and act as the internal expert other departments lean on when payroll questions come up.",
        whatYoullDo:
          'Run monthly pay cycles end to end. Keep tax and statutory filings accurate and on time. Reconcile payroll against the general ledger. Answer employee pay queries with patience and precision. Flag process gaps before they become problems.',
        whatYoullBring:
          'Payroll experience, ideally across more than one country or regulatory regime. Sharp attention to detail — payroll mistakes are expensive and personal. Comfort with spreadsheets and payroll software alike.',
        whatYoullGet: 'Competitive salary, a genuinely flexible schedule around pay-run deadlines, and a supportive finance team.',
        whyUs: "Because we build payroll software ourselves, you'll have a direct line to the product team — your day-to-day frustrations become next sprint's fixes.",
      },
      {
        title: 'Customer Success Manager',
        department: 'Customer Success',
        employmentType: 'FULL_TIME',
        location: 'Remote, NZ',
        roleSummary:
          "You'll be the face of tmPro for a portfolio of customers — helping HR teams get real value out of the platform, from onboarding through renewal.",
        whatYoullDo:
          'Onboard new tenants and get their teams comfortable fast. Run regular check-ins, catch churn risk early, and turn feature requests into clear product feedback. Build the playbooks and resources that make onboarding faster for the next customer.',
        whatYoullBring:
          'Experience in a customer-facing SaaS role. Comfort explaining a technical product to a non-technical HR audience. Genuine curiosity about the problems customers are trying to solve, not just the ticket in front of you.',
        whatYoullGet: 'Fully remote within NZ, flexible hours, and a direct say in the product roadmap.',
        whyUs: "You'll work closely enough with customers to actually see the difference you make — this isn't a queue of tickets, it's a portfolio of relationships.",
      },
      {
        title: 'People & Talent Coordinator',
        department: 'People',
        employmentType: 'PART_TIME',
        location: 'Auckland, NZ',
        roleSummary: "You'll support hiring and day-to-day people operations as we grow the team — a broad, hands-on role for someone early in their HR career.",
        whatYoullDo:
          'Coordinate interviews and keep candidates in the loop. Help maintain accurate employee records. Support onboarding for new hires. Assist with leave, benefits, and policy questions from the team.',
        whatYoullBring: 'Some HR or recruitment coordination experience. Excellent organization and follow-through. A genuinely people-first attitude.',
        whatYoullGet: 'Flexible part-time hours, mentorship from the People team, and hands-on exposure to every part of the employee lifecycle.',
        whyUs: "A small, growing team means you'll shape how People Ops works here, not just follow an existing playbook.",
      },
    ];

    for (const role of openRoles) {
      await tx.insert(requisitions).values({
        tenantId: tenantRow.id,
        title: role.title,
        department: role.department,
        headcount: 1,
        status: 'APPROVED',
        requestedById: bupe.id,
        approvedById: bupe.id,
        employmentType: role.employmentType,
        location: role.location,
        roleSummary: role.roleSummary,
        whatYoullDo: role.whatYoullDo,
        whatYoullBring: role.whatYoullBring,
        whatYoullGet: role.whatYoullGet,
        whyUs: role.whyUs,
        publishedAt: new Date(),
      });
    }
  });

  console.log('Done.');
  console.log('');
  console.log('Demo tenant: stockhub-demo');
  console.log(`Password for all demo users: ${DEMO_PASSWORD}`);
  console.log(' - admin@stockhub.net (HR Admin)');
  console.log(' - priya@stockhub.net (Supervisor — Bupe Zulu, has a pending leave request to approve)');
  console.log(' - sam@stockhub.net (Employee — Kunda Phiri, submitted that request)');
  console.log('Public careers page: /careers/stockhub-demo (4 open roles)');
  console.log('');
  console.log(`Platform Admin (/platform-admin): ${PLATFORM_ADMIN_EMAIL} / ${PLATFORM_ADMIN_PASSWORD}`);
  console.log(`  stockhub-demo seeded with every module enabled, seat cap ${DEMO_SEAT_CAP}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
