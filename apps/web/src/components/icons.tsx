// Small hand-rolled line icons (no icon-library dependency) — 20x20, currentColor stroke.

function Base({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      {children}
    </svg>
  );
}

export function IconGrid() {
  return (
    <Base>
      <rect x="3" y="3" width="6" height="6" rx="1.4" />
      <rect x="11" y="3" width="6" height="6" rx="1.4" />
      <rect x="3" y="11" width="6" height="6" rx="1.4" />
      <rect x="11" y="11" width="6" height="6" rx="1.4" />
    </Base>
  );
}

export function IconBriefcase() {
  return (
    <Base>
      <rect x="2.5" y="6.5" width="15" height="10" rx="1.6" />
      <path d="M7 6.5V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
      <path d="M2.5 11h15" />
    </Base>
  );
}

export function IconTarget() {
  return (
    <Base>
      <circle cx="10" cy="10" r="6.5" />
      <circle cx="10" cy="10" r="3" />
      <circle cx="10" cy="10" r="0.6" fill="currentColor" />
    </Base>
  );
}

export function IconDollar() {
  return (
    <Base>
      <path d="M10 2.5v15" />
      <path d="M13.5 5.8c-.6-.8-1.9-1.3-3.2-1.3-2 0-3.6 1-3.6 2.7 0 3.6 6.8 1.9 6.8 5.5 0 1.7-1.6 2.7-3.6 2.7-1.5 0-2.9-.6-3.6-1.5" />
    </Base>
  );
}

export function IconLogout() {
  return (
    <Base>
      <path d="M7.5 17.5H4a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1h3.5" />
      <path d="M13 14l4-4-4-4" />
      <path d="M17 10H7.5" />
    </Base>
  );
}

export function IconUsers() {
  return (
    <Base>
      <circle cx="7" cy="7" r="2.6" />
      <path d="M2.5 16c.5-3 2.2-4.5 4.5-4.5s4 1.5 4.5 4.5" />
      <circle cx="14.5" cy="7.5" r="2.1" />
      <path d="M12.8 11.8c1.9.2 3.2 1.6 3.7 4.2" />
    </Base>
  );
}

export function IconCalendar() {
  return (
    <Base>
      <rect x="2.5" y="4" width="15" height="13.5" rx="1.6" />
      <path d="M2.5 8h15" />
      <path d="M6 2.5v3" />
      <path d="M14 2.5v3" />
    </Base>
  );
}

export function IconGraduationCap() {
  return (
    <Base>
      <path d="M2 8l8-3.5L18 8l-8 3.5L2 8z" />
      <path d="M5.5 9.8v3.4c0 1 2 2.3 4.5 2.3s4.5-1.3 4.5-2.3V9.8" />
      <path d="M18 8v4.5" />
    </Base>
  );
}

export function IconDocument() {
  return (
    <Base>
      <path d="M5 2.5h7l3.5 3.5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z" />
      <path d="M12 2.5V6h3.5" />
      <path d="M6.5 10.5h6.5" />
      <path d="M6.5 13.5h6.5" />
    </Base>
  );
}

export function IconChartBar() {
  return (
    <Base>
      <path d="M3 17.5V3" />
      <rect x="5.5" y="10" width="3" height="7.5" rx="0.6" />
      <rect x="10" y="6.5" width="3" height="11" rx="0.6" />
      <rect x="14.5" y="12.5" width="3" height="5" rx="0.6" />
    </Base>
  );
}

export function IconSettings() {
  return (
    <Base>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.7v2.1M10 15.2v2.1M17.3 10h-2.1M4.8 10H2.7M15.2 4.8l-1.5 1.5M6.3 13.7l-1.5 1.5M15.2 15.2l-1.5-1.5M6.3 6.3 4.8 4.8" />
    </Base>
  );
}

export function IconChevronRight() {
  return (
    <Base>
      <path d="M7.5 4.5l5.5 5.5-5.5 5.5" />
    </Base>
  );
}

export function IconPlus() {
  return (
    <Base>
      <path d="M10 3.5v13M3.5 10h13" />
    </Base>
  );
}

export function IconUpload() {
  return (
    <Base>
      <path d="M10 13V3.5M6 7.5 10 3.5l4 4" />
      <path d="M3.5 14v2a1.4 1.4 0 0 0 1.4 1.4h10.2A1.4 1.4 0 0 0 16.5 16v-2" />
    </Base>
  );
}

export function IconDownload() {
  return (
    <Base>
      <path d="M10 3.5V13M6 9l4 4 4-4" />
      <path d="M3.5 14v2a1.4 1.4 0 0 0 1.4 1.4h10.2A1.4 1.4 0 0 0 16.5 16v-2" />
    </Base>
  );
}

export function IconTrash() {
  return (
    <Base>
      <path d="M3.5 5.5h13" />
      <path d="M7.5 5.5V4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5" />
      <path d="M5.5 5.5 6.2 16a1 1 0 0 0 1 1h5.6a1 1 0 0 0 1-1l.7-10.5" />
    </Base>
  );
}

export function IconPencil() {
  return (
    <Base>
      <path d="M12.5 3.5l4 4L6 18H2v-4L12.5 3.5z" />
      <path d="M11 5l4 4" />
    </Base>
  );
}

export function IconPrinter() {
  return (
    <Base>
      <path d="M5.5 7.5V3.5h9v4" />
      <path d="M5.5 15.5h-2A1.5 1.5 0 0 1 2 14v-4a1.5 1.5 0 0 1 1.5-1.5h13A1.5 1.5 0 0 1 18 10v4a1.5 1.5 0 0 1-1.5 1.5h-2" />
      <path d="M5.5 12.5h9v4h-9z" />
    </Base>
  );
}

/** Sidebar theme-switcher icon — a small paint-swatch/palette mark. */
export function IconPalette() {
  return (
    <Base>
      <path d="M10 2.75a7.25 7.25 0 1 0 0 14.5c.83 0 1.5-.67 1.5-1.5 0-.4-.16-.76-.42-1.03a1.5 1.5 0 0 1 1.06-2.56H13.5A3.75 3.75 0 0 0 17.25 8c0-2.9-3.25-5.25-7.25-5.25z" />
      <circle cx="6.25" cy="9" r="1" fill="currentColor" stroke="none" />
      <circle cx="8.25" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="11.75" cy="6" r="1" fill="currentColor" stroke="none" />
    </Base>
  );
}

/** Login page feature list — "multiple countries". */
export function IconGlobe() {
  return (
    <Base>
      <circle cx="10" cy="10" r="7" />
      <path d="M3 10h14" />
      <path d="M10 3c2.5 2 2.5 12 0 14M10 3c-2.5 2-2.5 12 0 14" />
    </Base>
  );
}

/** Login page feature list — "regulatory submissions". */
export function IconShield() {
  return (
    <Base>
      <path d="M10 2.5l6.5 2.6v4.6c0 4.2-2.7 7.2-6.5 8.3-3.8-1.1-6.5-4.1-6.5-8.3V5.1L10 2.5z" />
      <path d="M7.3 10l1.9 1.9 3.5-3.9" />
    </Base>
  );
}

/** Training — course video player "maximize" control. */
export function IconMaximize() {
  return (
    <Base>
      <path d="M7.5 2.75H2.75V7.5" />
      <path d="M12.5 2.75h4.75V7.5" />
      <path d="M7.5 17.25H2.75V12.5" />
      <path d="M12.5 17.25h4.75V12.5" />
    </Base>
  );
}

/** Training — course video player "restore/minimize" control. */
export function IconMinimize() {
  return (
    <Base>
      <path d="M2.75 7.5H7.5V2.75" />
      <path d="M17.25 7.5H12.5V2.75" />
      <path d="M2.75 12.5H7.5v4.75" />
      <path d="M17.25 12.5H12.5v4.75" />
    </Base>
  );
}

/** Training — a course card's "play" affordance. */
export function IconPlay() {
  return (
    <Base>
      <path d="M6 4.2v11.6a.8.8 0 0 0 1.22.68l9.1-5.8a.8.8 0 0 0 0-1.36l-9.1-5.8A.8.8 0 0 0 6 4.2z" fill="currentColor" stroke="none" />
    </Base>
  );
}
