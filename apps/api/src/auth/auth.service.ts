import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq, sql } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { db, withTenant } from '../db/client';
import { users, employees, candidates, tenants, organizationSettings } from '../db/schema';
import { resolveTenantBySlug } from '../common/tenant/tenant.util';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import type { LoginDto } from './dto/login.dto';
import type { IdentifyDto } from './dto/identify.dto';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type { CompletePasswordResetDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  constructor(private jwt: JwtService) {}

  /**
   * Identifier-first step: given only an email (matched case-insensitively —
   * see drizzle/0017_case_insensitive_email.sql), find which tenant(s) it
   * belongs to before any password is checked. The login page uses this to
   * drop the "type your organization" field: one match -> go straight to a
   * branded password screen (org logo + "Welcome back <name>"); several ->
   * show an org picker; none -> say so.
   *
   * This is a deliberate exception to this file's usual withTenant()-scoped
   * queries: the tenant isn't known yet, so the lookup has to run across all
   * tenants, via the same plain, untenanted `db` handle resolveTenantBySlug
   * already uses for the tenant-slug lookup. `app.current_tenant_id` is
   * therefore unset for this query, so the normal `tenant_isolation` RLS
   * policies (which compare against that setting) would otherwise evaluate
   * to NULL/false for every row on any Postgres role that isn't a superuser
   * or BYPASSRLS-privileged — this is exactly what caused "We couldn't find
   * an account with that email" for every email on a non-superuser DB role,
   * until drizzle/0018_identify_cross_tenant_read.sql added a second,
   * permissive `identify_lookup` policy scoped narrowly to "no tenant
   * context is set" on the tables this method reads (`users`,
   * `organization_settings`, `employees`, `candidates`). Every other query
   * in the app runs inside withTenant(), which always sets that context
   * first, so this extra policy never applies to them.
   */
  async identify(dto: IdentifyDto) {
    const email = dto.email.trim().toLowerCase();

    const rows = await db
      .select({
        tenantSlug: tenants.slug,
        tenantName: tenants.name,
        logoUrl: organizationSettings.logoUrl,
        employeeFirstName: employees.firstName,
        candidateFirstName: candidates.firstName,
      })
      .from(users)
      .innerJoin(tenants, eq(tenants.id, users.tenantId))
      .leftJoin(organizationSettings, eq(organizationSettings.tenantId, tenants.id))
      .leftJoin(employees, eq(employees.id, users.employeeId))
      .leftJoin(candidates, eq(candidates.id, users.candidateId))
      .where(sql`lower(${users.email}) = ${email}`);

    return {
      matches: rows.map((r) => ({
        tenantSlug: r.tenantSlug,
        tenantName: r.tenantName,
        logoUrl: r.logoUrl ?? null,
        displayName: r.employeeFirstName ?? r.candidateFirstName ?? null,
      })),
    };
  }

  async login(dto: LoginDto) {
    const tenant = await resolveTenantBySlug(dto.tenantSlug);
    if (!tenant) throw new UnauthorizedException('Unknown organization.');

    // v019.A — a tenant the platform owner has deactivated (or one that's
    // brand new and not yet activated) can't sign in at all, regardless of
    // whether the password would've been correct. See TenantsAdminService
    // and the Platform Admin "Inactive Tenants" tab.
    if (tenant.status === 'INACTIVE') {
      throw new UnauthorizedException('This organisation is currently inactive. Please contact support.');
    }

    // Email is matched case-insensitively throughout tmPro (see the 0017
    // migration) — "Jeff@Acme.com" and "jeff@acme.com" are the same login.
    const email = dto.email.trim().toLowerCase();

    const user = await withTenant(tenant.id, async (tx) => {
      const [row] = await tx
        .select()
        .from(users)
        .where(and(eq(users.tenantId, tenant.id), sql`lower(${users.email}) = ${email}`))
        .limit(1);
      return row ?? null;
    });
    if (!user) throw new UnauthorizedException('Invalid email or password.');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid email or password.');

    const profile = await withTenant(tenant.id, async (tx) => {
      if (user.employeeId) {
        const [emp] = await tx.select().from(employees).where(eq(employees.id, user.employeeId as string)).limit(1);
        return emp ? { kind: 'employee' as const, ...emp } : null;
      }
      if (user.candidateId) {
        const [cand] = await tx.select().from(candidates).where(eq(candidates.id, user.candidateId as string)).limit(1);
        return cand ? { kind: 'candidate' as const, ...cand } : null;
      }
      return null;
    });

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      tenantId: tenant.id,
      role: user.role,
      employeeId: user.employeeId ?? null,
    });

    return {
      accessToken,
      // enabledModules travels with the session so the sidebar can hide
      // nav links for modules this tenant doesn't have (see AppShell) —
      // cosmetic only, ModuleGuard on the API side is the real gate.
      tenant: { slug: tenant.slug, name: tenant.name, enabledModules: tenant.enabledModules },
      user: { id: user.id, email: user.email, role: user.role },
      profile,
    };
  }

  /** Self-service password change (v019.A) — the account menu at the bottom
   *  of the sidebar, available to every role. Scoped by the caller's own
   *  tenantId + userId from their JWT (CurrentUser), so this can only ever
   *  change the signed-in user's own password, never anyone else's. */
  async changePassword(user: AuthenticatedUser, dto: ChangePasswordDto) {
    await withTenant(user.tenantId, async (tx) => {
      const [row] = await tx.select().from(users).where(eq(users.id, user.userId)).limit(1);
      if (!row) throw new UnauthorizedException('Session no longer valid.');

      const valid = await bcrypt.compare(dto.currentPassword, row.passwordHash);
      if (!valid) throw new BadRequestException('Current password is incorrect.');

      await tx
        .update(users)
        .set({ passwordHash: await bcrypt.hash(dto.newPassword, 10) })
        .where(eq(users.id, user.userId));
    });
    return { ok: true };
  }

  /** Public completion of an Admin/HR-initiated password reset (v023.A —
   *  see EmployeesService.resetPassword(), which emails the link this token
   *  comes from). Untenanted lookup by design: the token alone identifies
   *  the account, and the tenant isn't known until it's resolved — same
   *  reasoning, and the same identify_lookup RLS policy on `users`, as
   *  identify() above. */
  async resetPasswordWithToken(dto: CompletePasswordResetDto) {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');

    const [row] = await db.select().from(users).where(eq(users.resetTokenHash, tokenHash)).limit(1);

    if (!row || !row.resetTokenExpiresAt || row.resetTokenExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('This reset link is invalid or has expired — ask an Admin to send you a new one.');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await withTenant(row.tenantId, (tx) =>
      tx
        .update(users)
        .set({ passwordHash, resetTokenHash: null, resetTokenExpiresAt: null })
        .where(eq(users.id, row.id)),
    );

    return { ok: true };
  }
}
