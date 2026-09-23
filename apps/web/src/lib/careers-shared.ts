/** Shared bits between the two public careers pages (all-tenant /careers and
 *  the tenant-scoped /careers/[tenantSlug]) and its job-detail/apply page —
 *  no server components in this app, so this is a plain client-safe module
 *  rather than a shared layout. */

export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: 'Full Time',
  PART_TIME: 'Part Time',
  CONTRACT: 'Contract',
  INTERN: 'Intern',
};

export function formatJobDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

export interface JobListing {
  id: string;
  title: string;
  department: string | null;
  employmentType: string | null;
  location: string | null;
  requiredSkills: string[];
  publishedAt: string | null;
}

export interface AllTenantsJobListing extends JobListing {
  tenantSlug: string;
  tenantName: string;
  tenantLogoUrl: string | null;
}
