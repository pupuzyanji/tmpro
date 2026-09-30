// v028.A — calendar-date helpers. The leave engine works on plain
// 'YYYY-MM-DD' strings (Postgres `date`) so there's never a timezone shift:
// a leave day is a calendar day, not an instant.

export type ISODate = string;

export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function parseISO(s: ISODate): Date {
  return new Date(`${s}T00:00:00Z`);
}

/** Any Date/timestamp/string → its calendar date (UTC). */
export function asISO(v: Date | string | null | undefined): ISODate | null {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  return toISO(v);
}

export function today(): ISODate {
  return toISO(new Date());
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISO(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

/** Adds calendar months, clamping to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(s: ISODate, n: number): ISODate {
  const d = parseISO(s);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = daysInMonth(target.getUTCFullYear(), target.getUTCMonth());
  target.setUTCDate(Math.min(day, last));
  return toISO(target);
}

export function addYears(s: ISODate, n: number): ISODate {
  return addMonths(s, n * 12);
}

export function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

export function monthStart(s: ISODate): ISODate {
  return `${s.slice(0, 7)}-01`;
}

export function monthEnd(s: ISODate): ISODate {
  const d = parseISO(s);
  return toISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

export function yearStart(s: ISODate): ISODate {
  return `${s.slice(0, 4)}-01-01`;
}

export function yearEnd(s: ISODate): ISODate {
  return `${s.slice(0, 4)}-12-31`;
}

export function maxDate(...ds: Array<ISODate | null | undefined>): ISODate {
  return ds.filter((d): d is ISODate => !!d).sort().at(-1)!;
}

export function minDate(...ds: Array<ISODate | null | undefined>): ISODate {
  return ds.filter((d): d is ISODate => !!d).sort()[0];
}

/** Inclusive day count between two dates. */
export function daysBetweenInclusive(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000) + 1;
}

/** Whole months completed from `from` up to `to` (anniversary-style). */
export function fullMonthsBetween(from: ISODate, to: ISODate): number {
  if (to < from) return 0;
  const a = parseISO(from);
  const b = parseISO(to);
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(s: ISODate): number {
  return (parseISO(s).getUTCDay() + 6) % 7;
}

export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-11-03' → '3 Nov 2026' (for messages). */
export function fmtDay(s: ISODate): string {
  const [y, m, d] = s.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}
