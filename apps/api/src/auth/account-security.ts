// v027.A — account-security helpers shared by AuthService, JwtStrategy and
// EmployeesService.

import { randomBytes, randomInt, createHash } from 'crypto';
import { and, desc, eq, lte } from 'drizzle-orm';
import { withTenant } from '../db/client';
import { employees, employeeStatusHistory, users } from '../db/schema';

/** The single shared password every generated login used to get (up to
 *  v026). Still recognised at sign-in so anyone who never changed it is made
 *  to choose a new one — never issued any more. */
export const LEGACY_SHARED_PASSWORD = 'Passw0rd!';

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const WEB_APP_URL = process.env.WEB_APP_URL || 'http://localhost:3000';

// No 0/O, 1/l/I — the password is often read out or copied by hand.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** A unique, random temporary password such as "Kp7m-Xq3r-Tz9w"
 *  (~70 bits). Only ever valid until first sign-in, when a change is forced. */
export function generateTempPassword(): string {
  const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `${group()}-${group()}-${group()}`;
}

/** Creates a single-use reset token on the account and returns the raw
 *  token for the emailed link. Only the SHA-256 hash is stored. */
export async function issueResetToken(tenantId: string, userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await withTenant(tenantId, (tx) =>
    tx
      .update(users)
      .set({ resetTokenHash: tokenHash, resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) })
      .where(eq(users.id, userId)),
  );
  return token;
}

export function resetLink(token: string): string {
  return `${WEB_APP_URL}/reset-password?token=${token}`;
}

/** True once an employee has left: their latest status entry that has
 *  already taken effect is ALUMNI. A future-dated ALUMNI entry (notice
 *  period) does not end access until its date arrives. Employees with no
 *  status history fall back to the current status column. */
export async function employeeAccessEnded(tenantId: string, employeeId: string): Promise<boolean> {
  return withTenant(tenantId, async (tx) => {
    const [latest] = await tx
      .select({ status: employeeStatusHistory.status })
      .from(employeeStatusHistory)
      .where(
        and(
          eq(employeeStatusHistory.tenantId, tenantId),
          eq(employeeStatusHistory.employeeId, employeeId),
          lte(employeeStatusHistory.effectiveDate, new Date()),
        ),
      )
      .orderBy(desc(employeeStatusHistory.effectiveDate))
      .limit(1);
    if (latest) return latest.status === 'ALUMNI';

    const [anyHistory] = await tx
      .select({ id: employeeStatusHistory.id })
      .from(employeeStatusHistory)
      .where(and(eq(employeeStatusHistory.tenantId, tenantId), eq(employeeStatusHistory.employeeId, employeeId)))
      .limit(1);
    if (anyHistory) return false; // only future-dated entries so far

    const [emp] = await tx
      .select({ status: employees.status })
      .from(employees)
      .where(and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId)))
      .limit(1);
    return emp?.status === 'ALUMNI';
  });
}

// Short cache so every API request can re-check access without a database
// round-trip each time. An employee marked as left is locked out of an
// existing session within a minute.
const accessCache = new Map<string, { ended: boolean; at: number }>();
const ACCESS_CACHE_MS = 60_000;

export async function employeeAccessEndedCached(tenantId: string, employeeId: string): Promise<boolean> {
  const key = `${tenantId}:${employeeId}`;
  const hit = accessCache.get(key);
  if (hit && Date.now() - hit.at < ACCESS_CACHE_MS) return hit.ended;
  const ended = await employeeAccessEnded(tenantId, employeeId);
  accessCache.set(key, { ended, at: Date.now() });
  if (accessCache.size > 5000) accessCache.clear();
  return ended;
}

export function forgetAccessCache(tenantId: string, employeeId: string) {
  accessCache.delete(`${tenantId}:${employeeId}`);
}

export const ACCESS_ENDED_MESSAGE =
  'Your access to this organisation has ended. If you think this is a mistake, contact your HR team.';
