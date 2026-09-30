// v028.A — shared types and helpers for the leave engine screens.

export type LeaveKind = 'ACCRUING' | 'ALLOWANCE' | 'EVENT' | 'EPISODE' | 'UNTRACKED';

export interface LeaveTypeOverview {
  leaveTypeId: string;
  code: string;
  name: string;
  kind: LeaveKind;
  unitBasis: 'WORKING_DAYS' | 'CALENDAR_DAYS';
  description: string | null;
  eligible: boolean;
  isPaid: boolean;
  reasonRequired: boolean;
  reasonAllowed: boolean;
  attachmentRequired: boolean;
  attachmentFromUnits: number | null;
  approvalFlow: string[];
  entitlement: number;
  cycle: string;
  eventRules: Record<string, any>;
  minServiceMonths: number;
  availableFrom: string | null;
  pending: number;
  balance?: number;
  available?: number;
  allotted?: number;
  used?: number;
  period?: string;
  nextAccrual?: { date: string; units: number } | null;
  carryForwardMax?: number | null;
  contractTerm?: 'SHORT' | 'LONG';
  tiers?: Record<string, number>;
  episode?: { startedOn: string; lastDay: string; fullUsed: number; halfUsed: number; status: string } | null;
  /** v028.C — annual leave not taken within the allowed months (Malawi s.44). */
  overdue?: { days: number; dueFrom: string; takeBy: string } | null;
  /** v028.C — a yearly sick-pay pot (Malawi s.46) instead of per-illness tiers. */
  sickYear?: {
    fullDays: number;
    halfDays: number;
    fullUsed: number;
    halfUsed: number;
    yearStart: string;
    yearEnd: string;
    payFrom: string;
    /** v028.E — length of the sick-leave cycle in years (SA: 3). */
    cycleYears?: number;
    /** v028.E — end of an early period with a slower entitlement (SA: first 6 months). */
    earlyUntil?: string | null;
    section: string | null;
  };
}

export interface LeaveOverview {
  employee: {
    id: string;
    name: string;
    countryCode: string;
    regime: string;
    category: string;
    contractTerm: 'SHORT' | 'LONG';
    serviceStart: string;
    leftOn: string | null;
    schedule: string;
    gender: string | null;
    hasNationalCalendar: boolean;
  } | null;
  types: LeaveTypeOverview[];
}

export interface LeaveRequestRow {
  id: string;
  employeeId: string;
  employee?: { id: string; firstName: string; lastName: string; photoUrl?: string | null };
  leaveType: { id: string; name: string; code: string | null; kind: LeaveKind };
  startDate: string;
  endDate: string;
  startHalf: boolean;
  endHalf: boolean;
  days: number;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'CANCELLED';
  eventDate: string | null;
  payBreakdown: Record<string, number>;
  approvalSteps: string[];
  currentStep: number;
  waitingFor: string | null;
  attachmentDocumentIds: string[];
  decisionComment: string | null;
  cancelReason: string | null;
  createdAt: string;
}

export interface Evaluation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  units: number;
  payBreakdown: Record<'FULL' | 'HALF' | 'UNPAID', number>;
  balance: { label: string; before: number | null; after: number | null } | null;
  holidaysSkipped: Array<{ date: string; name: string }>;
  attachmentRequired: boolean;
  reasonRequired: boolean;
  reasonAllowed: boolean;
  eventEntitlement: number | null;
}

export interface LedgerEntry {
  id: string;
  leaveTypeId: string;
  typeName: string;
  kind: LeaveKind;
  entryType: string;
  units: number;
  effectiveDate: string;
  cycleKey: string;
  payTier: string | null;
  sourceType: string;
  reasonCode: string | null;
  note: string | null;
  reversesId: string | null;
  reversed: boolean;
  createdAt: string;
  createdByName: string | null;
}

export const ENTRY_LABEL: Record<string, string> = {
  OPENING_BALANCE: 'Opening balance',
  OPENING_USAGE: 'Opening — already used',
  ACCRUAL: 'Accrued',
  ALLOTMENT: 'Granted',
  USAGE: 'Leave taken',
  USAGE_REVERSAL: 'Leave cancelled',
  ADJUSTMENT: 'Adjustment',
  ADJUSTMENT_REVERSAL: 'Reversal',
  CARRY_FORWARD: 'Carried forward',
  EXPIRY: 'Lapsed',
  FORFEIT: 'Forfeited',
  PAYOUT: 'Paid out',
};

export const REASON_LABEL: Record<string, string> = {
  MIGRATION_CORRECTION: 'Migration correction',
  GOODWILL_GRANT: 'Goodwill grant',
  COLLECTIVE_AGREEMENT: 'Collective agreement',
  COURT_OR_LABOUR_OFFICE: 'Court / labour office ruling',
  ERROR_CORRECTION: 'Error correction',
  SERVICE_RECOGNITION: 'Service recognition',
  OTHER: 'Other',
  OPENING_REVERSED: 'Opening batch reversed',
};

export const CATEGORY_LABEL: Record<string, string> = {
  PERMANENT: 'Permanent',
  FIXED_TERM: 'Fixed-term',
  TEMPORARY: 'Temporary',
  CASUAL: 'Casual',
};

export const KIND_LABEL: Record<LeaveKind, string> = {
  ACCRUING: 'Accrues monthly',
  ALLOWANCE: 'Allowance per period',
  EVENT: 'Per event',
  EPISODE: 'Per illness',
  UNTRACKED: 'No balance',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-11-03' or an ISO timestamp → '3 Nov 2026'. */
export function day(v: string | null | undefined): string {
  if (!v) return '—';
  const [y, m, d] = v.slice(0, 10).split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

export function span(r: { startDate: string; endDate: string }): string {
  const a = r.startDate.slice(0, 10);
  const b = r.endDate.slice(0, 10);
  return a === b ? day(a) : `${day(a)} – ${day(b)}`;
}

export function units(n: number | null | undefined, basis?: string): string {
  if (n == null) return '—';
  const v = Math.round(n * 100) / 100;
  const unit = basis === 'CALENDAR_DAYS' ? 'calendar day' : 'day';
  return `${v} ${unit}${v === 1 ? '' : 's'}`;
}

export function periodLabel(period?: string): string {
  if (!period) return '';
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split('-');
    return `${MONTHS[Number(m) - 1]} ${y}`;
  }
  return period;
}

export function stepLabel(step: string | null): string {
  if (step === 'SUPERVISOR') return 'supervisor';
  if (step === 'HR') return 'HR';
  return '—';
}
