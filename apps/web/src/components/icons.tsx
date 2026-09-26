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

// ---------------------------------------------------------------------------
// Tab-bar icons (Option 5A: icon + label pill, applied across every tab bar
// in the app — People detail, Payroll, Settings, Platform Admin). Reuses the
// icons above wherever the concept already matches (IconBriefcase for Job,
// IconCalendar for Leave, IconDocument for Documents, IconTarget for
// Performance, IconUsers for Employees, IconGraduationCap for Training,
// IconShield for both Permission and Regulatory Submission, IconDollar for
// Pay Runs) and adds the handful this row of tabs needed that didn't exist
// yet.

/** Single-person mark — distinct from the group IconUsers — for a "General
 *  Info" / profile tab. */
export function IconUser() {
  return (
    <Base>
      <circle cx="10" cy="6.8" r="3.3" />
      <path d="M3.8 17c0-3.6 2.8-6 6.2-6s6.2 2.4 6.2 6" />
    </Base>
  );
}

/** Notes tab — a speech-bubble, matching the agreed Option 5A mark. */
export function IconNote() {
  return (
    <Base>
      <path d="M3 4h14v10.5H8.5L4.5 18v-3.5H3z" />
    </Base>
  );
}

/** Payroll — Additions & Deductions: sliders standing in for line-item
 *  adjustments. */
export function IconAdjustments() {
  return (
    <Base>
      <path d="M4 5.5h12M4 10h12M4 14.5h12" />
      <circle cx="8" cy="5.5" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="13.5" cy="10" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="7" cy="14.5" r="1.6" fill="currentColor" stroke="none" />
    </Base>
  );
}

/** Settings — Organization. */
export function IconBuilding() {
  return (
    <Base>
      <rect x="4.5" y="2.5" width="9" height="15" rx="1" />
      <path d="M13.5 8.5h2.3a1 1 0 0 1 1 1v7h-3.3" />
      <path d="M7.2 5.8h.01M10.3 5.8h.01M7.2 8.8h.01M10.3 8.8h.01M7.2 11.8h.01M10.3 11.8h.01" />
      <path d="M7.5 17.5v-3h3v3" />
    </Base>
  );
}

/** Settings — Branches (physical locations). */
export function IconMapPin() {
  return (
    <Base>
      <path d="M10 17.5s5.5-4.9 5.5-9.3a5.5 5.5 0 0 0-11 0c0 4.4 5.5 9.3 5.5 9.3z" />
      <circle cx="10" cy="8.2" r="2" />
    </Base>
  );
}

/** Settings — Designations (role badges). */
export function IconTag() {
  return (
    <Base>
      <path d="M10.8 3H16a1 1 0 0 1 1 1v5.2a1 1 0 0 1-.3.7l-7 7a1 1 0 0 1-1.4 0l-5.2-5.2a1 1 0 0 1 0-1.4l7-7a1 1 0 0 1 .7-.3z" />
      <circle cx="13.3" cy="6.7" r="1.1" fill="currentColor" stroke="none" />
    </Base>
  );
}

/** Settings — Announcements. */
export function IconMegaphone() {
  return (
    <Base>
      <path d="M3 8.5v3a1 1 0 0 0 1 1h1.3l1 4h2l-.8-4H9l6 3v-11L9 7.5H4a1 1 0 0 0-1 1z" />
      <path d="M15 6.2a4 4 0 0 1 0 7.6" />
    </Base>
  );
}

/** Settings — Org Chart. */
export function IconSitemap() {
  return (
    <Base>
      <rect x="7" y="2.5" width="6" height="4" rx="1" />
      <rect x="2.5" y="13" width="6" height="4" rx="1" />
      <rect x="11.5" y="13" width="6" height="4" rx="1" />
      <path d="M10 6.5v3M5.5 13v-3h9v3" />
    </Base>
  );
}

/** Platform Admin tenant list — Active. */
export function IconCheckCircle() {
  return (
    <Base>
      <circle cx="10" cy="10" r="7.3" />
      <path d="M6.8 10.2l2.2 2.2 4.2-4.6" />
    </Base>
  );
}

/** Platform Admin tenant list — Inactive. */
export function IconPauseCircle() {
  return (
    <Base>
      <circle cx="10" cy="10" r="7.3" />
      <path d="M8.2 7.3v5.4M11.8 7.3v5.4" />
    </Base>
  );
}

/** Platform Admin tenant list — Pending Applications. */
export function IconClock() {
  return (
    <Base>
      <circle cx="10" cy="10" r="7.3" />
      <path d="M10 6v4.3l3 1.8" />
    </Base>
  );
}

/** Documents (Admin/HR tenant-wide browser) — Official ID group. */
export function IconIdCard() {
  return (
    <Base>
      <rect x="2.5" y="4.5" width="15" height="11" rx="1.6" />
      <circle cx="7" cy="10" r="1.8" />
      <path d="M4.5 13.5c.3-1.4 1.2-2.1 2.5-2.1s2.2.7 2.5 2.1" />
      <path d="M11.5 8h4M11.5 10.5h4" />
    </Base>
  );
}

/** Documents (Admin/HR tenant-wide browser) — Other Files group. */
export function IconFolder() {
  return (
    <Base>
      <path d="M2.5 6a1 1 0 0 1 1-1h4l1.5 2h7.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V6z" />
    </Base>
  );
}

/** Documents (Admin/HR tenant-wide browser) — expand/collapse a tag group. */
export function IconChevronDown() {
  return (
    <Base>
      <path d="M4.5 7.5l5.5 5.5 5.5-5.5" />
    </Base>
  );
}

export function IconHelp() {
  return (
    <Base>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M7.8 7.9a2.3 2.3 0 0 1 4.4.9c0 1.5-2.2 2-2.2 3.2" />
      <path d="M10 14.6h.01" />
    </Base>
  );
}
