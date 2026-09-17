// Initials-based avatar, with an optional uploaded portrait. Pass `photoUrl`
// when the person has one on file and it's rendered instead; otherwise every
// person gets a deterministically-colored initials circle — same person
// always gets the same color.

const PALETTE = [
  ['#14B8F0', '#2B3AF5'],
  ['#2B3AF5', '#8B2FD9'],
  ['#8B2FD9', '#D626C9'],
  ['#D626C9', '#F9268F'],
  ['#F9268F', '#FF8A1E'],
  ['#FF8A1E', '#14B8F0'],
] as const;

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/[\s._@]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const SIZES = {
  sm: 'h-7 w-7 text-[11px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-14 w-14 text-base',
} as const;

export function Avatar({
  name,
  photoUrl,
  size = 'md',
  className = '',
}: {
  /** Full name, or email, or anything unique to the person — used both for initials and color. */
  name: string;
  /** An uploaded portrait (data URI or URL) — rendered instead of initials when present. */
  photoUrl?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        title={name}
        className={`inline-block shrink-0 rounded-full object-cover ${SIZES[size]} ${className}`}
      />
    );
  }
  const initials = initialsFrom(name);
  const [from, to] = PALETTE[hashString(name) % PALETTE.length];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${SIZES[size]} ${className}`}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
      title={name}
    >
      {initials}
    </span>
  );
}
