// Mirrors apps/api/src/common/modules/module-catalog.ts — same 8 keys as
// the "Register your organisation" feature checklist, so a tenant's
// `enabledModules` (set by the platform admin) uses the exact same strings
// end to end. Keep both files in sync by hand; there's no shared package
// between apps/web and apps/api yet.
export const MODULE_KEYS = [
  'Employee Records',
  'Leave & Attendance',
  'Performance Management',
  'Payroll',
  'Recruitment',
  'Training & LMS',
  'Policies & Documents',
  'Reports & Analytics',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

// 'Employee Records' is core — every tenant has it, unconditionally (see
// module-catalog.ts). 'Policies & Documents' has no dedicated backend
// module yet, so toggling it in the platform-admin GUI doesn't gate
// anything today — it's still stored/shown so a converted lead's requested
// features aren't lossy.
export const CORE_MODULE_KEYS: ModuleKey[] = ['Employee Records'];
export const UNGATED_MODULE_KEYS: ModuleKey[] = ['Employee Records', 'Policies & Documents'];
