// Large thick-ring stat tile for dashboard headline numbers (Headcount,
// Departments, Pending Requests, etc.) — a bold circular ring in the tmPro
// brand gradient family, with the number/label centered in the hollow
// middle. (Originally a rotated teardrop shape — kept the component name
// and prop API so callers didn't need to change.)

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
}: {
  value: number | string;
  label: string;
  color?: keyof typeof TEARDROP_GRADIENTS;
  size?: 'lg' | 'md';
}) {
  const [from, to] = TEARDROP_GRADIENTS[color];
  const { outer, thickness, text } = SIZES[size];
  const inner = outer - thickness * 2;
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div
        className="flex shrink-0 items-center justify-center rounded-full shadow-card"
        style={{ width: outer, height: outer, background: `linear-gradient(135deg, ${from}, ${to})` }}
      >
        <div className="flex items-center justify-center rounded-full bg-white" style={{ width: inner, height: inner }}>
          <span className={`${text} font-bold text-ink`}>{value}</span>
        </div>
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}
