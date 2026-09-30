// v028.A — sets a tenant up on the leave engine, and converts pre-v028 data.
//
// Idempotent and cheap to call repeatedly. For each country the tenant
// employs people in (plus the 'OTHER' fallback):
//   * a native template (Zambia) → one leave type + policy per template item,
//     re-using and converting a matching legacy type where one exists;
//   * no template → legacy types are converted as-is (their old numbers
//     become the first policy version); if there are none, the generic
//     template is used with zero entitlements for the tenant to fill in.
// Then every legacy APPROVED request becomes a ledger USAGE entry plus
// per-day rows for payroll, and legacy PENDING requests get an approval flow.

import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import {
  employees,
  leaveLedger,
  leavePolicies,
  leaveRequestDays,
  leaveRequests,
  leaveRuleTemplateItems,
  leaveRuleTemplates,
  leaveSettings,
  leaveTypes,
  workSchedules,
} from '../../../db/schema';
import { countUnits } from './calendar';
import { loadEmployeeCtx, LeaveTypeRow, Tx } from './context';
import { addDays, asISO, ISODate, today } from './dates';
import { cycleKeyFor, post } from './ledger';

function cycleKeyForSafe(kind: string, date: ISODate, serviceStart: ISODate): string {
  if (kind === 'ACCRUING') return cycleKeyFor('EMPLOYMENT_ANNIVERSARY', date, serviceStart);
  if (kind === 'ALLOWANCE') return cycleKeyFor('CALENDAR_YEAR', date, serviceStart);
  if (kind === 'EVENT') return `EVT-${date}`;
  return 'NONE';
}

export const ENGINE_VERSION = 'v028.E';

type TemplateItem = typeof leaveRuleTemplateItems.$inferSelect;

// Legacy (pre-v028) type names → template codes, for every country that has
// a template (Zambia since v028.A, Malawi since v028.C). Anything else is
// matched on its name's slug (e.g. "Study Leave" → STUDY_LEAVE / STUDY).
const LEGACY_NAMES: Record<string, string> = {
  'Annual Leave': 'ANNUAL',
  'Sick Leave – Long-term Contract': 'SICK',
  'Sick Leave': 'SICK',
  'Maternity Leave': 'MATERNITY',
  'Paternity Leave': 'PATERNITY',
  'Compassionate/Special Leave': 'COMPASSIONATE',
  'Compassionate Leave': 'COMPASSIONATE',
  'Family Responsibility Leave': 'FAMILY_RESP',
  'Study Leave': 'STUDY',
  'Wedding Leave': 'WEDDING',
  'Marriage Leave': 'WEDDING',
  'Unpaid Leave': 'UNPAID',
};
// Legacy types folded into another code (their requests are re-pointed).
const LEGACY_MERGE: Record<string, string> = {
  'Sick Leave – Short-term Contract': 'SICK',
};
// v028.D — country-specific names that override the lists above.
const LEGACY_BY_COUNTRY: Record<string, Record<string, string>> = {
  AU: {
    'Sick Leave': 'PERSONAL',
    'Sick Leave – Long-term Contract': 'PERSONAL',
    'Sick Leave – Short-term Contract': 'PERSONAL',
    "Personal/Carer's Leave": 'PERSONAL',
    'Personal Leave': 'PERSONAL',
    'Carers Leave': 'PERSONAL',
    'Maternity Leave': 'PARENTAL',
    'Parental Leave': 'PARENTAL',
    'Compassionate/Special Leave': 'COMPASSIONATE',
    'Family Violence Leave': 'FAMILY_VIOLENCE',
    'Domestic Violence Leave': 'FAMILY_VIOLENCE',
  },
  ZA: {
    'Sick Leave – Long-term Contract': 'SICK',
    'Compassionate/Special Leave': 'FAMILY_RESP',
    'Compassionate Leave': 'FAMILY_RESP',
    'Family Responsibility Leave': 'FAMILY_RESP',
    'Maternity Leave': 'PARENTAL',
    'Parental Leave': 'PARENTAL',
  },
  ZW: {
    'Vacation Leave': 'ANNUAL',
    'Sick Leave – Long-term Contract': 'SICK',
    'Compassionate/Special Leave': 'SPECIAL',
    'Compassionate Leave': 'SPECIAL',
    'Special Leave': 'SPECIAL',
  },
  NZ: {
    'Annual Holidays': 'ANNUAL',
    'Maternity Leave': 'PARENTAL',
    'Parental Leave': 'PARENTAL',
    'Paternity Leave': 'PARTNER',
    'Compassionate/Special Leave': 'BEREAVEMENT',
    'Compassionate Leave': 'BEREAVEMENT',
    'Bereavement Leave': 'BEREAVEMENT',
    'Family Violence Leave': 'FAMILY_VIOLENCE',
    'Domestic Violence Leave': 'FAMILY_VIOLENCE',
  },
};

function legacyCode(countryCode: string, name: string): string | undefined {
  return LEGACY_BY_COUNTRY[countryCode]?.[name] ?? LEGACY_NAMES[name];
}

// Second legacy types folded into a code another legacy type already took.
const LEGACY_MERGE_BY_COUNTRY: Record<string, Record<string, string>> = {
  AU: { 'Sick Leave': 'PERSONAL', 'Sick Leave – Short-term Contract': 'PERSONAL', 'Sick Leave – Long-term Contract': 'PERSONAL' },
  ZA: { 'Paternity Leave': 'PARENTAL' },
};

function legacyMergeCode(countryCode: string, name: string): string | undefined {
  return LEGACY_MERGE_BY_COUNTRY[countryCode]?.[name] ?? LEGACY_MERGE[name];
}


function slug(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 32);
}

async function templateItems(tx: Tx, countryCode: string): Promise<TemplateItem[] | null> {
  const [tpl] = await tx
    .select()
    .from(leaveRuleTemplates)
    .where(and(eq(leaveRuleTemplates.countryCode, countryCode), isNull(leaveRuleTemplates.effectiveTo)))
    .orderBy(asc(leaveRuleTemplates.effectiveFrom))
    .limit(1);
  if (!tpl) return null;
  return tx.select().from(leaveRuleTemplateItems).where(eq(leaveRuleTemplateItems.templateId, tpl.id)).orderBy(asc(leaveRuleTemplateItems.sortOrder));
}

function typeFieldsFromItem(item: TemplateItem) {
  const d = item.defaults as Record<string, any>;
  return {
    code: item.code,
    kind: item.kind,
    unitBasis: item.unitBasis,
    genderRestriction: (d.genderRestriction as string) ?? 'ANY',
    reasonRequired: !!d.reasonRequired,
    reasonAllowed: d.reasonAllowed !== false,
    attachmentRequired: !!d.attachmentRequired,
    attachmentFromUnits: d.attachmentFromUnits ?? null,
    approvalFlow: (d.approvalFlow as string[]) ?? ['SUPERVISOR'],
    templateItemId: item.id,
    isPaid: d.paid !== false,
    sortOrder: item.sortOrder,
    description: (d.description as string) ?? null,
    isActive: true,
  };
}

function policyFromItem(item: TemplateItem, tenantId: string, typeId: string, effectiveFrom: ISODate, entitlementOverride?: number) {
  const d = item.defaults as Record<string, any>;
  const entitlement = entitlementOverride ?? Number(d.entitlement ?? item.statutoryMin ?? 0);
  return {
    tenantId,
    leaveTypeId: typeId,
    effectiveFrom,
    entitlement,
    cycle: item.cycle,
    accrualFrequency: (d.accrualFrequency as string) ?? (item.kind === 'ACCRUING' ? 'MONTHLY' : item.kind === 'ALLOWANCE' ? 'UPFRONT' : 'NONE'),
    proratePartial: d.prorate ?? item.kind === 'ACCRUING',
    usableAfterMonths: Number(d.usableAfterMonths ?? 0),
    minServiceMonths: Number(d.minServiceMonths ?? 0),
    eligibleCategories: (d.eligibleCategories as string[]) ?? null,
    carryForwardMax: d.carryForwardMax ?? null,
    excessAction: (d.excessAction as string) ?? 'CARRY_ALL',
    allowNegative: 0,
    payRules: { ...(d.payRules ?? {}), ...(d.payoutOnTermination != null ? { payoutOnTermination: d.payoutOnTermination } : {}) },
    eventRules: d.eventRules ?? {},
    entitlementByWeek: (d.entitlementByWeek as Array<{ minDays: number; entitlement: number }>) ?? null,
  };
}

async function provisionFromTemplate(tx: Tx, tenantId: string, countryCode: string, items: TemplateItem[], effectiveFrom: ISODate) {
  const existing = await tx.select().from(leaveTypes).where(and(eq(leaveTypes.tenantId, tenantId), eq(leaveTypes.countryCode, countryCode)));
  // Types already built from this template are keyed by code. Everything
  // else not tied to a template item is "legacy": either never converted
  // (no code) or converted by name before the country had a template
  // (v028.C: Malawi types converted by v028.A), which are upgraded here.
  const byCode = new Map(existing.filter((t) => t.code && t.templateItemId).map((t) => [t.code!, t]));
  const legacy = existing.filter((t) => !t.templateItemId && t.isActive && (!t.code || t.code === slug(t.name)));

  for (const item of items) {
    if (byCode.has(item.code)) continue;
    const legacyMatch =
      legacy.find((t) => legacyCode(countryCode, t.name) === item.code) ??
      legacy.find((t) => slug(t.name) === item.code || slug(t.name) === `${item.code}_LEAVE`);
    let typeId: string;
    let from = effectiveFrom;
    let keepEntitlement: number | undefined;
    if (legacyMatch) {
      // Converted in place (keeps its id, so existing requests stay linked);
      // the numbers come from the statutory template, not the old settings.
      await tx.update(leaveTypes).set({ ...typeFieldsFromItem(item), name: item.name }).where(eq(leaveTypes.id, legacyMatch.id));
      typeId = legacyMatch.id;
      legacy.splice(legacy.indexOf(legacyMatch), 1);
      // Upgrading a type that was already converted: keep its history if it
      // has any (close the old version yesterday, template rules from today),
      // otherwise simply replace its policy.
      const old = await tx
        .select({ id: leavePolicies.id, entitlement: leavePolicies.entitlement, effectiveTo: leavePolicies.effectiveTo })
        .from(leavePolicies)
        .where(eq(leavePolicies.leaveTypeId, typeId));
      // Company (non-statutory) types keep the number the organisation set;
      // statutory ones take the law's numbers from the template.
      const oldOpen = old.find((o) => !o.effectiveTo);
      if (item.statutoryMin == null && oldOpen && Number(oldOpen.entitlement) > 0) keepEntitlement = Number(oldOpen.entitlement);
      if (old.length) {
        const [used] = await tx.select({ id: leaveLedger.id }).from(leaveLedger).where(eq(leaveLedger.leaveTypeId, typeId)).limit(1);
        if (used) {
          from = today();
          await tx
            .update(leavePolicies)
            .set({ effectiveTo: addDays(from, -1) })
            .where(and(eq(leavePolicies.leaveTypeId, typeId), isNull(leavePolicies.effectiveTo)));
          // A cut-over, like an opening balance: whatever the ledger holds
          // is carried, and the new rules accrue from today — the engine
          // must not replay history under the new kind (e.g. an old yearly
          // allowance becoming a monthly-accruing type).
          if (item.kind === 'ACCRUING') {
            const staff = await tx
              .select({ id: employees.id })
              .from(employees)
              .where(and(eq(employees.tenantId, tenantId), eq(employees.countryCode, countryCode)));
            for (const e of staff) {
              await post(tx, {
                tenantId,
                employeeId: e.id,
                leaveTypeId: typeId,
                entryType: 'OPENING_BALANCE',
                units: 0,
                effectiveDate: addDays(from, -1),
                cycleKey: 'NONE',
                sourceType: 'MIGRATION',
                idemKey: `UPG:${typeId}:${e.id}`,
                note: `Switched to the ${countryCode} statutory rules — the balance so far is carried over and accrual under the new rules starts here`,
              });
            }
          }
        } else {
          await tx.delete(leavePolicies).where(eq(leavePolicies.leaveTypeId, typeId));
        }
      }
    } else {
      const [row] = await tx
        .insert(leaveTypes)
        .values({ tenantId, countryCode, name: item.name, ...typeFieldsFromItem(item) })
        .returning({ id: leaveTypes.id });
      typeId = row.id;
    }
    await tx.insert(leavePolicies).values(policyFromItem(item, tenantId, typeId, from, keepEntitlement));
    byCode.set(item.code, { id: typeId } as LeaveTypeRow);
  }

  // Legacy types merged into another code (e.g. a second sick-leave type):
  // re-point their requests and ledger entries, then retire them.
  for (const t of legacy) {
    // Only names that are known duplicates are merged (never a custom type).
    const target = legacyMergeCode(countryCode, t.name);
    if (target && byCode.has(target)) {
      const targetId = byCode.get(target)!.id;
      await tx.update(leaveRequests).set({ leaveTypeId: targetId }).where(eq(leaveRequests.leaveTypeId, t.id));
      await tx.update(leaveLedger).set({ leaveTypeId: targetId }).where(eq(leaveLedger.leaveTypeId, t.id));
      await tx.update(leaveTypes).set({ code: `LEGACY_${slug(t.name)}`.slice(0, 32), isActive: false }).where(eq(leaveTypes.id, t.id));
    }
  }
  // Remaining legacy types the template doesn't cover (e.g. "Other Leave")
  // stay as tenant-specific custom types, converted with their old numbers.
  const remaining = await tx
    .select()
    .from(leaveTypes)
    .where(and(eq(leaveTypes.tenantId, tenantId), eq(leaveTypes.countryCode, countryCode), isNull(leaveTypes.code)));
  for (const t of remaining) await convertLegacyType(tx, t, effectiveFrom);
}

/** Converts one pre-v028 leave type using its old days/period/carry-over. */
async function convertLegacyType(tx: Tx, t: LeaveTypeRow, effectiveFrom: ISODate) {
  const name = t.name;
  let kind: string;
  let cycle: string;
  let accrualFrequency: string;
  let entitlement: number;
  if (!t.isPaid || (t.defaultAnnualDays === 0 && /unpaid|other/i.test(name))) {
    kind = 'UNTRACKED';
    cycle = 'NONE';
    accrualFrequency = 'NONE';
    entitlement = 0;
  } else if (/maternity|paternity/i.test(name)) {
    kind = 'EVENT';
    cycle = 'PER_EVENT';
    accrualFrequency = 'NONE';
    entitlement = t.defaultAnnualDays;
  } else if (t.accrualPeriod === 'MONTHLY' || t.accrualPeriod === 'DAILY') {
    kind = 'ACCRUING';
    cycle = 'EMPLOYMENT_ANNIVERSARY';
    accrualFrequency = 'MONTHLY';
    entitlement = t.accrualPeriod === 'MONTHLY' ? t.defaultAnnualDays * 12 : t.defaultAnnualDays * 365;
  } else {
    kind = t.carryOverEnabled ? 'ACCRUING' : 'ALLOWANCE';
    cycle = t.carryOverEnabled ? 'EMPLOYMENT_ANNIVERSARY' : 'CALENDAR_YEAR';
    accrualFrequency = 'UPFRONT';
    entitlement = t.defaultAnnualDays;
  }
  const gender = /maternity/i.test(name) ? 'FEMALE' : /paternity/i.test(name) ? 'MALE' : 'ANY';
  await tx
    .update(leaveTypes)
    .set({
      code: slug(name) || `TYPE_${t.id.slice(0, 8)}`,
      kind,
      unitBasis: /maternity/i.test(name) ? 'CALENDAR_DAYS' : 'WORKING_DAYS',
      genderRestriction: gender,
      approvalFlow: ['SUPERVISOR'],
      isActive: true,
    })
    .where(eq(leaveTypes.id, t.id));
  await tx.insert(leavePolicies).values({
    tenantId: t.tenantId,
    leaveTypeId: t.id,
    effectiveFrom,
    entitlement,
    cycle,
    accrualFrequency,
    proratePartial: kind === 'ACCRUING',
    usableAfterMonths: 0,
    minServiceMonths: 0,
  });
}

async function ensureSettings(tx: Tx, tenantId: string) {
  await tx.insert(leaveSettings).values({ tenantId, engineStartedOn: today() }).onConflictDoNothing();
  const [sched] = await tx.select({ id: workSchedules.id }).from(workSchedules).where(eq(workSchedules.tenantId, tenantId)).limit(1);
  if (!sched) {
    await tx.insert(workSchedules).values({ tenantId, name: 'Monday–Friday', dayWeights: [1, 1, 1, 1, 1, 0, 0], hoursPerDay: 8, isDefault: true });
  }
}

/** Provision one country regime for a tenant (used when an Admin opens a new country in Settings too). */
export async function ensureCountry(tx: Tx, tenantId: string, countryCode: string) {
  const effectiveFrom = '2000-01-01';
  const items = await templateItems(tx, countryCode);
  if (items) {
    await provisionFromTemplate(tx, tenantId, countryCode, items, effectiveFrom);
    return;
  }
  const legacy = await tx
    .select()
    .from(leaveTypes)
    .where(and(eq(leaveTypes.tenantId, tenantId), eq(leaveTypes.countryCode, countryCode), isNull(leaveTypes.code)));
  for (const t of legacy) await convertLegacyType(tx, t, effectiveFrom);
  const [any] = await tx.select({ id: leaveTypes.id }).from(leaveTypes).where(and(eq(leaveTypes.tenantId, tenantId), eq(leaveTypes.countryCode, countryCode))).limit(1);
  if (!any && countryCode === 'OTHER') {
    const generic = await templateItems(tx, '*');
    if (generic) await provisionFromTemplate(tx, tenantId, countryCode, generic, effectiveFrom);
  }
}

/** Legacy requests → ledger + per-day rows + approval flow. */
async function migrateLegacyRequests(tx: Tx, tenantId: string) {
  const legacy = await tx
    .select()
    .from(leaveRequests)
    .where(and(eq(leaveRequests.tenantId, tenantId), sql`not exists (select 1 from leave_request_days d where d.request_id = ${leaveRequests.id})`));
  if (legacy.length === 0) return;
  const types = await tx.select().from(leaveTypes).where(eq(leaveTypes.tenantId, tenantId));
  const typeById = new Map(types.map((t) => [t.id, t]));
  const ctxCache = new Map<string, Awaited<ReturnType<typeof loadEmployeeCtx>>>();
  for (const r of legacy) {
    const type = typeById.get(r.leaveTypeId);
    if (!type) continue;
    if (!ctxCache.has(r.employeeId)) ctxCache.set(r.employeeId, await loadEmployeeCtx(tx, tenantId, r.employeeId, today()));
    const emp = ctxCache.get(r.employeeId);
    if (!emp) continue;
    const start = asISO(r.startDate)!;
    const end = asISO(r.endDate)!;
    const counted = await countUnits(tx, emp, type.unitBasis, start, end);
    const factor = type.isPaid ? 1 : 0;
    const days = counted.days.length ? counted.days : [{ day: start, units: Number(r.days) }];
    for (const d of days) {
      await tx
        .insert(leaveRequestDays)
        .values({ tenantId, requestId: r.id, employeeId: r.employeeId, day: d.day, units: d.units, payFactor: factor })
        .onConflictDoNothing();
    }
    if (r.status === 'APPROVED') {
      await post(tx, {
        tenantId,
        employeeId: r.employeeId,
        leaveTypeId: type.id,
        entryType: 'USAGE',
        units: -Number(r.days),
        effectiveDate: start,
        cycleKey: cycleKeyForSafe(type.kind, start, emp.serviceStart),
        payTier: factor ? 'FULL' : 'UNPAID',
        sourceType: 'MIGRATION',
        sourceId: r.id,
        idemKey: `MIG:${r.id}`,
        note: 'Approved before v028 — migrated from the old leave records',
      });
      if (type.kind === 'EVENT') {
        await post(tx, {
          tenantId, employeeId: r.employeeId, leaveTypeId: type.id, entryType: 'ALLOTMENT', units: Number(r.days),
          effectiveDate: start, cycleKey: `EVT-${start}`, sourceType: 'MIGRATION', sourceId: r.id, idemKey: `MIGEVT:${r.id}`,
        });
      }
      await tx.update(leaveRequests).set({ payBreakdown: { [factor ? 'FULL' : 'UNPAID']: Number(r.days) } }).where(eq(leaveRequests.id, r.id));
    } else if (r.status === 'PENDING') {
      await tx
        .update(leaveRequests)
        .set({ approvalSteps: (type.approvalFlow as string[]) ?? ['SUPERVISOR'], currentStep: 0 })
        .where(eq(leaveRequests.id, r.id));
    }
  }
}

/** Full, idempotent tenant set-up. Returns the regimes provisioned. */
export async function ensureTenantLeave(tx: Tx, tenantId: string): Promise<string[]> {
  await ensureSettings(tx, tenantId);
  const empCountries = await tx.selectDistinct({ c: employees.countryCode }).from(employees).where(eq(employees.tenantId, tenantId));
  const typeCountries = await tx.selectDistinct({ c: leaveTypes.countryCode }).from(leaveTypes).where(eq(leaveTypes.tenantId, tenantId));
  const countries = new Set<string>(['OTHER', ...empCountries.map((r) => r.c), ...typeCountries.map((r) => r.c)]);
  const provisioned: string[] = [];
  for (const c of countries) {
    const items = await templateItems(tx, c);
    const [hasTypes] = await tx.select({ id: leaveTypes.id }).from(leaveTypes).where(and(eq(leaveTypes.tenantId, tenantId), eq(leaveTypes.countryCode, c))).limit(1);
    if (items || hasTypes || c === 'OTHER') {
      await ensureCountry(tx, tenantId, c);
      provisioned.push(c);
    }
  }
  await migrateLegacyRequests(tx, tenantId);
  await tx.update(leaveSettings).set({ provisionedAt: new Date() }).where(eq(leaveSettings.tenantId, tenantId));
  return provisioned;
}

