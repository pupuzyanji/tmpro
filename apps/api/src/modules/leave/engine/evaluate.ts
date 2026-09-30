// v028.A — evaluates a (proposed or pending) leave request against the rules.
// The same function backs the live preview, submission and final approval,
// so what the employee sees before submitting is exactly what gets posted.

import { and, desc, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import { leaveRequests, sickLeaveEpisodes } from '../../../db/schema';
import { countUnits } from './calendar';
import { earlyEarned, recentEvent, sickCaps, sickCycle, sickUsedInYear, yearlySickRule } from './compliance';
import {
  currentPolicy,
  daysPerWeek,
  eligibleForCategory,
  workWeekAllowed,
  entitlementFor,
  EmployeeCtx,
  genderAllowed,
  LeaveTypeRow,
  policyOn,
  PolicyRow,
  TenantLeaveSettings,
  Tx,
} from './context';
import { addDays, addMonths, fmtDay, fullMonthsBetween, ISODate, monthEnd, monthStart, round2, today } from './dates';
import { anniversaryCycle, balance, cycleBalance, cycleKeyFor } from './ledger';

export interface RequestInput {
  start: ISODate;
  end: ISODate;
  startHalf?: boolean;
  endHalf?: boolean;
  eventDate?: ISODate | null;
  multipleBirth?: boolean;
  excludeRequestId?: string | null;
}

export interface EvaluatedDay {
  day: ISODate;
  units: number;
  payFactor: number;
}

export interface Evaluation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  units: number;
  days: EvaluatedDay[];
  payBreakdown: Record<'FULL' | 'HALF' | 'UNPAID', number>;
  cycleKey: string;
  policyId: string | null;
  balance: { label: string; before: number | null; after: number | null } | null;
  holidaysSkipped: Array<{ date: string; name: string }>;
  attachmentRequired: boolean;
  reasonRequired: boolean;
  reasonAllowed: boolean;
  episode: { id: string | null; startedOn: ISODate; fullUsed: number; halfUsed: number } | null;
  eventEntitlement: number | null;
}

const PENDING_STATUSES = ['PENDING'] as const;

async function otherRequests(tx: Tx, emp: EmployeeCtx, excludeId?: string | null) {
  return tx
    .select()
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.tenantId, emp.tenantId),
        eq(leaveRequests.employeeId, emp.id),
        inArray(leaveRequests.status, ['PENDING', 'APPROVED']),
        ...(excludeId ? [ne(leaveRequests.id, excludeId)] : []),
      ),
    );
}

export async function evaluate(
  tx: Tx,
  emp: EmployeeCtx,
  type: LeaveTypeRow,
  versions: PolicyRow[],
  input: RequestInput,
  settings: TenantLeaveSettings,
): Promise<Evaluation> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const policy = policyOn(versions, input.start) ?? currentPolicy(versions, input.start);
  const kind = type.kind;
  const res: Evaluation = {
    ok: false,
    errors,
    warnings,
    units: 0,
    days: [],
    payBreakdown: { FULL: 0, HALF: 0, UNPAID: 0 },
    cycleKey: 'NONE',
    policyId: policy?.id ?? null,
    balance: null,
    holidaysSkipped: [],
    attachmentRequired: false,
    reasonRequired: type.reasonRequired,
    reasonAllowed: type.reasonAllowed,
    episode: null,
    eventEntitlement: null,
  };

  if (!input.start || !input.end) {
    errors.push('Choose a start and end date.');
    return res;
  }
  if (input.end < input.start) {
    errors.push('The end date is before the start date.');
    return res;
  }
  if (!policy) {
    errors.push(`${type.name} has no policy configured yet — ask your HR team.`);
    return res;
  }
  if (!genderAllowed(type, emp)) errors.push(`${type.name} is only available to ${type.genderRestriction === 'FEMALE' ? 'female' : 'male'} employees.`);
  if (!workWeekAllowed(policy, emp)) {
    errors.push(`${type.name} applies only to people who work at least ${policy.payRules?.minDaysPerWeek} days a week.`);
  }
  if (!eligibleForCategory(policy, emp)) {
    errors.push(`${type.name} doesn't apply to ${emp.category.toLowerCase().replace('_', '-')} employees.`);
  }
  if (input.start < emp.serviceStart) errors.push(`The leave starts before this person's service start (${fmtDay(emp.serviceStart)}).`);
  if (emp.lastDay && input.end > emp.lastDay) errors.push(`The leave runs past this person's last day (${fmtDay(emp.lastDay)}).`);

  const serviceAtStart = fullMonthsBetween(emp.serviceStart, input.start);
  const refDate = kind === 'EVENT' && input.eventDate ? input.eventDate : input.start;
  const serviceAtRef = fullMonthsBetween(emp.serviceStart, refDate);
  if (policy.minServiceMonths > 0 && serviceAtRef < policy.minServiceMonths) {
    errors.push(
      `${type.name} needs ${policy.minServiceMonths} months of service — available from ${fmtDay(addMonths(emp.serviceStart, policy.minServiceMonths))}.`,
    );
  }
  if (kind === 'ACCRUING' && policy.usableAfterMonths > 0 && serviceAtStart < policy.usableAfterMonths) {
    errors.push(
      `${type.name} can be taken after ${policy.usableAfterMonths} months of service — from ${fmtDay(addMonths(emp.serviceStart, policy.usableAfterMonths))}.`,
    );
  }

  // --- units ---------------------------------------------------------------
  const halvesAllowed = type.unitBasis !== 'CALENDAR_DAYS';
  const counted = await countUnits(
    tx,
    emp,
    type.unitBasis,
    input.start,
    input.end,
    halvesAllowed && !!input.startHalf,
    halvesAllowed && !!input.endHalf,
  );
  res.units = counted.units;
  res.holidaysSkipped = counted.skippedHolidays.map((h) => ({ date: h.date, name: h.name }));
  if (counted.units <= 0) {
    errors.push('There are no working days in that range (weekends and public holidays are not counted).');
    return res;
  }
  res.attachmentRequired = type.attachmentRequired && (type.attachmentFromUnits == null || counted.units > Number(type.attachmentFromUnits));

  // --- overlaps --------------------------------------------------------------
  const others = await otherRequests(tx, emp, input.excludeRequestId);
  const overlap = others.find((r) => {
    const s = r.startDate.toISOString().slice(0, 10);
    const e = r.endDate.toISOString().slice(0, 10);
    return s <= input.end && e >= input.start;
  });
  if (overlap) {
    errors.push(
      `This overlaps another ${overlap.status.toLowerCase()} request (${fmtDay(overlap.startDate.toISOString().slice(0, 10))} – ${fmtDay(overlap.endDate.toISOString().slice(0, 10))}).`,
    );
  }
  const pendingSameType = others.filter((r) => r.leaveTypeId === type.id && (PENDING_STATUSES as readonly string[]).includes(r.status));

  // --- by kind -----------------------------------------------------------------
  const tiers: Array<'FULL' | 'HALF' | 'UNPAID'> = [];
  let fullFactor = 1;

  if (kind === 'ACCRUING') {
    res.cycleKey = cycleKeyFor('EMPLOYMENT_ANNIVERSARY', input.start, emp.serviceStart);
    const now = today();
    const bal = await balance(tx, emp.tenantId, emp.id, type.id);
    // Accruals still to come between today and the leave start count towards it.
    let projected = 0;
    if (policy.accrualFrequency === 'MONTHLY' && input.start > now) {
      for (let m = monthStart(now); monthEnd(m) <= input.start; m = addMonths(m, 1)) {
        if (monthEnd(m) >= now) projected += entitlementFor(policyOn(versions, monthEnd(m)) ?? policy, emp) / 12;
      }
    }
    const pending = pendingSameType.reduce((s, r) => s + Number(r.days), 0);
    const available = round2(bal + projected - pending);
    res.balance = { label: input.start > now ? `Available by ${fmtDay(input.start)}` : 'Available', before: available, after: round2(available - counted.units) };
    if (counted.units > available + Number(policy.allowNegative)) {
      errors.push(`Not enough ${type.name}: ${available} day${available === 1 ? '' : 's'} available${pending ? ` (after ${pending} pending)` : ''}, ${counted.units} requested.`);
    }
  } else if (kind === 'ALLOWANCE') {
    res.cycleKey = cycleKeyFor(policy.cycle, input.start, emp.serviceStart);
    const endKey = cycleKeyFor(policy.cycle, input.end, emp.serviceStart);
    if (endKey !== res.cycleKey) {
      errors.push(`${type.name} is granted per ${policy.cycle === 'CALENDAR_MONTH' ? 'month' : 'year'} — split this into one request per period.`);
    }
    const cb = await cycleBalance(tx, emp.tenantId, emp.id, type.id, res.cycleKey);
    const base = cb.hasAllotment ? cb.remaining : round2(entitlementFor(policy, emp) - cb.used);
    const pending = pendingSameType
      .filter((r) => cycleKeyFor(policy.cycle, r.startDate.toISOString().slice(0, 10), emp.serviceStart) === res.cycleKey)
      .reduce((s, r) => s + Number(r.days), 0);
    const available = round2(base - pending);
    res.balance = { label: 'Left this period', before: available, after: round2(available - counted.units) };
    if (counted.units > available + Number(policy.allowNegative)) {
      errors.push(`Not enough ${type.name} left for this period: ${available} available, ${counted.units} requested.`);
    }
  } else if (kind === 'EVENT') {
    const rules = policy.eventRules ?? {};
    if (!input.eventDate) {
      errors.push(`Enter the ${String(rules.eventLabel ?? 'event date').toLowerCase()}.`);
    } else {
      res.cycleKey = `EVT-${input.eventDate}`;
      const extra = input.multipleBirth ? Number(rules.multipleBirthExtraDays ?? 0) : 0;
      const entitlement = round2(entitlementFor(policy, emp) + extra);
      res.eventEntitlement = entitlement;
      const sameEvent = others.filter((r) => r.leaveTypeId === type.id && r.eventDate === input.eventDate);
      const usedForEvent = sameEvent.reduce((s, r) => s + Number(r.days), 0);
      const available = round2(entitlement - usedForEvent);
      res.balance = { label: 'For this event', before: available, after: round2(available - counted.units) };
      if (counted.units > available) errors.push(`${type.name} allows ${entitlement} ${type.unitBasis === 'CALENDAR_DAYS' ? 'calendar' : 'working'} days for this event; ${available} left, ${counted.units} requested.`);
      const win = rules.windowDaysAfterEvent != null ? Number(rules.windowDaysAfterEvent) : null;
      if (win != null && (input.start < input.eventDate || input.start > addDays(input.eventDate, win))) {
        errors.push(`${type.name} must start within ${win} days of the ${String(rules.eventLabel ?? 'event').toLowerCase()} (${fmtDay(input.eventDate)} – ${fmtDay(addDays(input.eventDate, win))}).`);
      }
      const minAfter = rules.minDaysAfterDelivery != null ? Number(rules.minDaysAfterDelivery) : null;
      if (minAfter != null && input.end < addDays(input.eventDate, minAfter - 1)) {
        warnings.push(
          `This ends less than ${Math.round(minAfter / 7)} weeks after delivery — returning that early needs a doctor's certificate (${String(rules.returnRuleRef ?? 's.42')}).`,
        );
      }
      // v028.C — "once every N years" (Malawi maternity s.47, paternity s.47A):
      // a second event inside the window is allowed but unpaid, so HR can
      // still decide; the preview says so up front.
      const everyYears = Number(rules.recurrenceYears ?? 0);
      let recurrenceUnpaid = false;
      if (everyYears > 0) {
        const prev = await recentEvent(tx, emp, type, input.start, everyYears, input.excludeRequestId);
        if (prev) {
          recurrenceUnpaid = true;
          fullFactor = 0;
          const what = type.name.toLowerCase();
          warnings.push(
            `Paid ${what} is allowed once every ${everyYears} years and the last one started ${fmtDay(prev.start)}` +
              (prev.start < input.start ? ` — this request would be unpaid (paid ${what} is available again from ${fmtDay(prev.nextFrom)}).` : ' — this request would be unpaid.'),
          );
        }
      }
      const pr = policy.payRules ?? {};
      if (!recurrenceUnpaid && pr.fullPayMinServiceMonths != null && serviceAtRef < Number(pr.fullPayMinServiceMonths)) {
        const mode = String(pr.underServicePay ?? 'FULL');
        fullFactor = mode === 'UNPAID' ? 0 : mode === 'HALF' ? 0.5 : 1;
        warnings.push(
          `Under ${pr.fullPayMinServiceMonths} months of service: paid at ${mode === 'FULL' ? 'full pay (company policy)' : mode === 'HALF' ? 'half pay' : 'no pay'}.`,
        );
      }
    }
  } else if (kind === 'EPISODE') {
    const pr = policy.payRules ?? {};
    const [ep] = await tx
      .select()
      .from(sickLeaveEpisodes)
      .where(
        and(
          eq(sickLeaveEpisodes.tenantId, emp.tenantId),
          eq(sickLeaveEpisodes.employeeId, emp.id),
          lte(sickLeaveEpisodes.startedOn, input.start),
          gte(sickLeaveEpisodes.lastDay, addDays(input.start, -settings.sickEpisodeLinkDays - 1)),
          ne(sickLeaveEpisodes.status, 'CLOSED'),
        ),
      )
      .orderBy(desc(sickLeaveEpisodes.lastDay))
      .limit(1);
    const epStart = ep?.startedOn ?? input.start;
    res.episode = { id: ep?.id ?? null, startedOn: epStart, fullUsed: Number(ep?.fullPayUsed ?? 0), halfUsed: Number(ep?.halfPayUsed ?? 0) };
    res.cycleKey = ep ? `E${ep.id}` : 'E-new';
    const yearly = yearlySickRule(policy);
    if (yearly) {
      // v028.C/E — a sick-pay pot per service cycle: Malawi s.46 (yearly,
      // 4 + 8 weeks, after 12 months), South Africa s.22 (36 months, 6 weeks,
      // 1 day per 26 worked in the first 6 months), Zimbabwe s.14 (yearly,
      // 90 + 90 days). Before `minServiceMonths`, sick leave is unpaid.
      const dpw = daysPerWeek(emp) || 5;
      const caps = sickCaps(yearly, dpw);
      const payFrom = addMonths(emp.serviceStart, yearly.minServiceMonths);
      const earlyUntil = yearly.earlyMonths ? addMonths(emp.serviceStart, yearly.earlyMonths) : null;
      const used = new Map<string, { full: number; half: number; startFull: number }>();
      let preService = 0;
      let overCap = 0;
      let earlyCapped = 0;
      for (const d of counted.days) {
        if (d.day < payFrom) {
          preService += d.units;
          res.payBreakdown.UNPAID += d.units;
          res.days.push({ day: d.day, units: d.units, payFactor: 0 });
          continue;
        }
        const cyc = sickCycle(emp.serviceStart, d.day, yearly.cycleYears);
        if (!used.has(cyc.start)) {
          const u = await sickUsedInYear(tx, emp, type, cyc.start, input.excludeRequestId, cyc.end);
          used.set(cyc.start, { full: u.full, half: u.half, startFull: u.full });
        }
        const u = used.get(cyc.start)!;
        const fullCap = earlyUntil && d.day < earlyUntil ? Math.min(caps.full, earlyEarned(yearly, emp.serviceStart, d.day, dpw)) : caps.full;
        let factor = 0;
        if (u.full < fullCap) {
          factor = 1;
          u.full += d.units;
        } else if (u.half < caps.half) {
          factor = 0.5;
          u.half += d.units;
        } else if (fullCap < caps.full) earlyCapped += d.units;
        else overCap += d.units;
        res.payBreakdown[factor === 1 ? 'FULL' : factor === 0.5 ? 'HALF' : 'UNPAID'] += d.units;
        res.days.push({ day: d.day, units: d.units, payFactor: factor });
      }
      const first = used.get(sickCycle(emp.serviceStart, maxDateOf(input.start, payFrom), yearly.cycleYears).start);
      const period = yearly.cycleYears > 1 ? `this ${yearly.cycleYears}-year sick-leave cycle` : 'this service year';
      res.balance = first
        ? { label: `Full-pay sick days left ${period}`, before: round2(Math.max(0, caps.full - first.startFull)), after: round2(Math.max(0, caps.full - first.full)) }
        : null;
      const sec = yearly.section ? ` (${yearly.section})` : '';
      if (preService > 0) {
        warnings.push(
          `${round2(preService)} day(s) fall in the first ${yearly.minServiceMonths} months of service, when sick leave is unpaid — sick pay starts ${fmtDay(payFrom)}${sec}.`,
        );
      }
      if (earlyCapped > 0) {
        warnings.push(
          `${round2(earlyCapped)} day(s) unpaid — in the first ${yearly.earlyMonths} months only 1 paid sick day is earned for every ${yearly.earlyDivisor} days worked${sec}.`,
        );
      }
      if (res.payBreakdown.HALF > 0) warnings.push(`${round2(res.payBreakdown.HALF)} day(s) at half pay — the ${caps.full} full-pay days for ${period} are used up${sec}.`);
      if (overCap > 0) warnings.push(`${round2(overCap)} day(s) unpaid — sick pay for ${period} (${caps.full} full${caps.half ? ` + ${caps.half} half-pay` : ''} days) is used up${sec}.`);
    } else if (emp.contractTerm === 'SHORT') {
      const rule = pr.SHORT ?? { fullDays: 26, halfDays: 26 };
      let fullLeft = Math.max(0, Number(rule.fullDays) - res.episode.fullUsed);
      let halfLeft = Math.max(0, Number(rule.halfDays) - res.episode.halfUsed);
      for (const d of counted.days) {
        let u = d.units;
        const f = Math.min(u, fullLeft);
        fullLeft -= f;
        u -= f;
        const h = Math.min(u, halfLeft);
        halfLeft -= h;
        u -= h;
        res.payBreakdown.FULL += f;
        res.payBreakdown.HALF += h;
        res.payBreakdown.UNPAID += u;
        res.days.push({ day: d.day, units: d.units, payFactor: round2((f + h * 0.5) / d.units) });
      }
      res.balance = { label: 'Full-pay sick days left in this episode', before: round2(Number(rule.fullDays) - res.episode.fullUsed), after: round2(fullLeft) };
    } else {
      const rule = pr.LONG ?? { fullMonths: 3, halfMonths: 3 };
      const fullUntil = addDays(addMonths(epStart, Number(rule.fullMonths)), -1);
      const halfUntil = addDays(addMonths(epStart, Number(rule.fullMonths) + Number(rule.halfMonths)), -1);
      for (const d of counted.days) {
        const tier = d.day <= fullUntil ? 'FULL' : d.day <= halfUntil ? 'HALF' : 'UNPAID';
        res.payBreakdown[tier] += d.units;
        res.days.push({ day: d.day, units: d.units, payFactor: tier === 'FULL' ? 1 : tier === 'HALF' ? 0.5 : 0 });
      }
      res.balance = { label: `Full pay until ${fmtDay(fullUntil)}, half pay until`, before: null, after: null };
      res.warnings.push(`Episode started ${fmtDay(epStart)}: full pay to ${fmtDay(fullUntil)}, half pay to ${fmtDay(halfUntil)} (s.38).`);
    }
    if (!yearly) {
      if (res.payBreakdown.UNPAID > 0) {
        warnings.push('Sick-pay entitlement for this episode is used up — the remaining days are unpaid. Review for medical discharge (s.38).');
      } else if (res.payBreakdown.HALF > 0) {
        warnings.push(`${round2(res.payBreakdown.HALF)} day(s) fall in the half-pay period.`);
      }
      if (ep) warnings.push(`Continues the sick-leave episode that began ${fmtDay(ep.startedOn)}.`);
    }
  } else {
    // UNTRACKED
    fullFactor = type.isPaid ? 1 : 0;
  }

  // v028.D — unpaid event leave (NZ/AU parental leave, which the government
  // rather than the employer pays) costs a day's pay.
  if (kind === 'EVENT' && !type.isPaid) fullFactor = 0;
  if (kind !== 'EPISODE') {
    for (const d of counted.days) res.days.push({ day: d.day, units: d.units, payFactor: fullFactor });
    const tier = fullFactor === 1 ? 'FULL' : fullFactor === 0 ? 'UNPAID' : 'HALF';
    res.payBreakdown[tier] = counted.units;
    tiers.push(tier);
  }
  for (const k of Object.keys(res.payBreakdown) as Array<keyof typeof res.payBreakdown>) res.payBreakdown[k] = round2(res.payBreakdown[k]);

  res.ok = errors.length === 0;
  return res;
}

function maxDateOf(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}
