// The canonical list of tmPro "modules" a tenant can be entitled to — the
// same 8 keys as the `FEATURES` checklist on the public "Register your
// organisation" form (apps/web/src/app/register-organisation/page.tsx) and
// `org_signup_requests.featuresNeeded`, so a lead's requested features can
// be copied straight into a tenant's `enabledModules` with no translation.
// Mirrored on the frontend at apps/web/src/lib/modules.ts — keep both in
// sync by hand (no shared package between apps/api and apps/web yet).
//
// Not every key maps to something a guard can actually gate:
//  - 'Employee Records' is the core system of record every other module
//    references (see docs/tmpro-build-framework.md §3) — every tenant has
//    it, unconditionally. It's listed here so the platform-admin GUI can
//    still show it (as a locked, always-on row) rather than silently
//    omitting one of the 8 features prospects are asked about.
//  - 'Policies & Documents' has no dedicated backend module yet — "/documents"
//    is just the employee's own Documents tab (part of Employee Records).
//    It's storable (so a converted lead's request isn't lossy) but not
//    enforced by any guard until a real Documents/Policies module exists.
// `GATED_MODULE_KEYS` is the subset actually checked by `ModuleGuard`.

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

export const CORE_MODULE_KEYS: ModuleKey[] = ['Employee Records'];

export const UNGATED_MODULE_KEYS: ModuleKey[] = ['Employee Records', 'Policies & Documents'];

export const GATED_MODULE_KEYS: ModuleKey[] = MODULE_KEYS.filter((k) => !UNGATED_MODULE_KEYS.includes(k));

/** Every module a brand-new tenant gets by default (used by the seed data
 *  and as a sane fallback if a tenant row somehow has no `enabledModules`
 *  set) — everything on, matching how tmPro behaved before entitlements
 *  existed at all. */
export const ALL_MODULE_KEYS: ModuleKey[] = [...MODULE_KEYS];

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value);
}
