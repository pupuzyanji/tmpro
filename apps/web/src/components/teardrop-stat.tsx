// Large thick-ring stat tile for dashboard headline numbers (Headcount,
// Departments, Pending Requests, etc.) — a bold circular ring in the tmPro
// brand gradient family, with the number/label centered in the hollow
// middle. (Originally a rotated teardrop shape — kept the component name
// and prop API so callers didn't need to change.)
//
// v020.A: optional `href` makes the whole tile a link (e.g. Headcount ->
// /people) so every dashboard number leads somewhere, per the "all
// dashboard info should be clickable" instruction — a plain `<a href="#…">`
// works here too for a same-page anchor scroll (see the Admin "Pending
// requests" ring on the dashboard).

import Link from 'next/link';

const TEARDROP_GRADIENTS = {
  cyan: ['#14B8F0', '#2B3AF5'],
  violet: ['#8B2FD9', '#D626C9'],
  orange: ['#D626C9', '#FF8A1E'],
  indigo: ['#5B21D6', '#8B2FD9'],
} as const;

const SIZES = {
  lg: { outer: 112, thickness: 14, text: 'text-3xl' },
  md: { outer: 80, thickness: 10, text: 'text-xl' },
} as const;

export function TeardropStat({
  value,
  label,
  color = 'cyan',
  size = 'lg',
  href,
}: {
  value: number | string;
  label: string;
  color?: keyof typeof TEARDROP_GRADIENTS;
  size?: 'lg' | 'md';
  href?: string;
}) {
  const [from, to] = TEARDROP_GRADIENTS[color];
  const { outer, thickness, text } = SIZES[size];
  const inner = outer - thickness * 2;

  const ring = (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full shadow-card ${href ? 'transition-transform group-hover:scale-[1.04]' : ''}`}
      style={{ width: outer, height: outer, background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      <div className="flex items-center justify-center rounded-full bg-white" style={{ width: inner, height: inner }}>
        <span className={`${text} font-bold text-ink`}>{value}</span>
      </div>
    </div>
  );
  const labelEl = (
    <p className={`text-xs font-semibold uppercase tracking-wide text-slate-500 ${href ? 'group-hover:text-brand-blue' : ''}`}>
      {label}
    </p>
  );

  if (href) {
    return (
      <Link href={href} className="group flex flex-col items-center gap-2 text-center">
        {ring}
        {labelEl}
      </Link>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      {ring}
      {labelEl}
    </div>
  );
}
