/** v028.B — the accent colour of each area of tmPro.
 *
 *  Returns one of the `accent-*` classes defined in globals.css. app-shell.tsx
 *  puts it on <main> so every card title in that area picks up the colour,
 *  and the dashboard uses it to colour each quick link after the area it
 *  opens. Keep this list in step with the sidebar's sections. */
export type Accent = 'blue' | 'cyan' | 'purple' | 'magenta' | 'orange' | 'green' | 'teal' | 'indigo' | 'slate';

const SETTINGS_ACCENTS: Record<string, Accent> = {
  leave: 'cyan',
  training: 'green',
  billing: 'orange',
  employees: 'blue',
  'org-chart': 'blue',
};

const AREA_ACCENTS: Record<string, Accent> = {
  dashboard: 'blue',
  people: 'blue',
  leave: 'cyan',
  timesheets: 'teal',
  payroll: 'orange',
  requisitions: 'purple',
  performance: 'magenta',
  training: 'green',
  documents: 'indigo',
  reports: 'slate',
  support: 'indigo',
};

export function accentFor(pathname: string | null | undefined): Accent {
  const [area, sub] = (pathname ?? '').split('?')[0].split('/').filter(Boolean);
  if (area === 'settings') return (sub && SETTINGS_ACCENTS[sub]) || 'indigo';
  return (area && AREA_ACCENTS[area]) || 'blue';
}

export function accentClass(pathname: string | null | undefined): string {
  return `accent-${accentFor(pathname)}`;
}
