import { and, count, eq, inArray } from 'drizzle-orm';
import { withTenant } from '../../db/client';
import { employeeStatusEnum, employees } from '../../db/schema';

// Everyone except an offboarded/alumni employee counts against a tenant's
// seat cap — onboarding/active/on-leave/offboarding staff are all still
// current headcount. Mirrors the framework doc's Employee Profiles
// lifecycle. Shared between EmployeesService (which enforces the cap on
// create) and TenantsAdminService (which displays seat usage), so the
// number shown to the platform admin and the number actually enforced
// never drift apart.
export const SEAT_COUNTED_STATUSES = employeeStatusEnum.enumValues.filter((s) => s !== 'ALUMNI');

export async function countSeatsUsed(tenantId: string): Promise<number> {
  const [row] = await withTenant(tenantId, (tx) =>
    tx
      .select({ n: count() })
      .from(employees)
      .where(and(eq(employees.tenantId, tenantId), inArray(employees.status, SEAT_COUNTED_STATUSES))),
  );
  return row?.n ?? 0;
}
