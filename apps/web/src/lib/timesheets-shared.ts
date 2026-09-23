// Timesheets (v022.A) — kept in sync by hand with
// apps/api/src/modules/timesheets/dto/timesheet.dto.ts (TIMESHEET_WORK_TYPES,
// TIME_PATTERN) since apps/web and apps/api don't share a workspace package.

export const TIMESHEET_WORK_TYPES = ['Regular', 'Overtime', 'Public Holiday', 'Training', 'Travel'] as const;

export interface BreakEntry {
  start: string;
  end: string;
}

export interface DayEntryForm {
  date: string;
  startTime: string;
  endTime: string;
  breaks: BreakEntry[];
  workSite: string;
  position: string;
  workType: string;
  notes: string;
}

export interface Timesheet {
  id: string;
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  breaks: BreakEntry[];
  totalHours: string | number;
  workSite: string | null;
  position: string | null;
  workType: string | null;
  notes: string | null;
  status: 'PENDING' | 'APPROVED' | 'DECLINED';
  decidedById: string | null;
  decidedAt: string | null;
  createdAt: string;
  employee?: { id: string; firstName: string; lastName: string };
}

export function emptyDayEntry(date = '', workSite = '', position = ''): DayEntryForm {
  return { date, startTime: '', endTime: '', breaks: [], workSite, position, workType: TIMESHEET_WORK_TYPES[0], notes: '' };
}

export function toDateInput(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/** Next 7 days (including today) as ISO date strings, for pre-seeding the
 *  Add Weekly Timesheet form's rows. */
export function nextSevenDays(): string[] {
  const out: string[] = [];
  const start = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
