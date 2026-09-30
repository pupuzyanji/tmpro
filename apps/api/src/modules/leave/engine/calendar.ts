// v028.A — how many leave units a date range costs one employee.

import type { EmployeeCtx, Tx } from './context';
import { eachDay, ISODate, round2, weekdayIndex } from './dates';
import { Holiday, holidaysBetween } from './holidays';

export interface DayUnit {
  day: ISODate;
  units: number;
}

export interface CountResult {
  days: DayUnit[];
  units: number;
  skippedHolidays: Holiday[];
}

/**
 * WORKING_DAYS: each day counts its weight in the employee's work schedule
 * (e.g. Saturday 0.5 on a 5½-day week), minus public/company holidays.
 * CALENDAR_DAYS (maternity): every day counts 1.
 * Half-day flags halve the first/last day (a one-day request with both set is still ½).
 */
export async function countUnits(
  tx: Tx,
  emp: EmployeeCtx,
  basis: string,
  start: ISODate,
  end: ISODate,
  startHalf = false,
  endHalf = false,
): Promise<CountResult> {
  const holidays = basis === 'CALENDAR_DAYS' ? [] : await holidaysBetween(tx, emp.tenantId, emp.countryCode, start, end);
  const holidayDates = new Map(holidays.map((h) => [h.date, h]));
  const days: DayUnit[] = [];
  const skipped: Holiday[] = [];
  for (const d of eachDay(start, end)) {
    let u = basis === 'CALENDAR_DAYS' ? 1 : emp.weekWeights[weekdayIndex(d)] ?? 0;
    if (u > 0 && holidayDates.has(d)) {
      skipped.push(holidayDates.get(d)!);
      u = 0;
    }
    if (u > 0 && basis !== 'CALENDAR_DAYS') {
      if (d === start && startHalf) u = Math.min(u, 0.5);
      if (d === end && endHalf && !(d === start && startHalf)) u = Math.min(u, 0.5);
    }
    if (u > 0) days.push({ day: d, units: u });
  }
  return { days, units: round2(days.reduce((s, x) => s + x.units, 0)), skippedHolidays: skipped };
}
