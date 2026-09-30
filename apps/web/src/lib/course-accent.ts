/** v029.B — a stable accent colour per training course (one of the
 *  `accent-*` classes in globals.css), so a course looks the same on the
 *  Training page and in Settings → Training. */
const COURSE_ACCENTS = ['cyan', 'purple', 'magenta', 'orange', 'green', 'teal', 'indigo', 'blue'] as const;

export function courseAccent(id: string): (typeof COURSE_ACCENTS)[number] {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COURSE_ACCENTS[h % COURSE_ACCENTS.length];
}

/** The cover used when a course has no image: a gradient in its accent. */
export const COURSE_COVER =
  'radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, var(--section) 55%, white) 0%, transparent 60%), linear-gradient(135deg, var(--section), color-mix(in srgb, var(--section) 55%, #0b1437))';
