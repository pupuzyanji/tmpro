const LEAVE_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  DECLINED: 'bg-red-50 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

const GOAL_STYLES: Record<string, string> = {
  NOT_STARTED: 'bg-slate-100 text-slate-600',
  IN_PROGRESS: 'bg-amber-50 text-amber-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
};

const EMPLOYEE_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  ONBOARDING: 'bg-sky-50 text-sky-700',
  ON_LEAVE: 'bg-amber-50 text-amber-700',
  OFFBOARDING: 'bg-orange-50 text-orange-700',
  ALUMNI: 'bg-slate-100 text-slate-500',
};

const COURSE_STYLES: Record<string, string> = {
  PENDING: 'bg-slate-100 text-slate-600',
  STARTED: 'bg-sky-50 text-sky-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
};

export function StatusBadge({ status, kind = 'leave' }: { status: string; kind?: 'leave' | 'goal' | 'employee' | 'course' }) {
  const styles = kind === 'goal' ? GOAL_STYLES : kind === 'employee' ? EMPLOYEE_STYLES : kind === 'course' ? COURSE_STYLES : LEAVE_STYLES;
  return <span className={`badge ${styles[status] ?? 'bg-slate-100 text-slate-600'}`}>{status.replace('_', ' ')}</span>;
}
