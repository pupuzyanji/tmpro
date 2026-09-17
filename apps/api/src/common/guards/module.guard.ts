import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { tenants } from '../../db/schema';
import { REQUIRES_MODULE_KEY } from '../decorators/requires-module.decorator';
import type { ModuleKey } from '../modules/module-catalog';

/**
 * Applied after JwtAuthGuard/RolesGuard, same shape as RolesGuard. No
 * @RequiresModule() on a route means it isn't gated (most of the app isn't
 * — only the handful of controllers backing an optional module are).
 *
 * `tenants` isn't a tenant-scoped table (no RLS, no `withTenant()` — same
 * reasoning as resolveTenantBySlug()/AuthService.identify()), so this is a
 * plain, untenanted lookup by id.
 */
@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<ModuleKey | undefined>(REQUIRES_MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user?.tenantId) return false;

    const [tenant] = await db
      .select({ enabledModules: tenants.enabledModules })
      .from(tenants)
      .where(eq(tenants.id, user.tenantId))
      .limit(1);

    // A tenant row that somehow has no enabledModules set (shouldn't happen
    // — the column defaults to '{}' — but fail closed rather than open if
    // it ever does) is only let through for modules that predate this
    // entitlement system entirely; there are none, so this is just '{}'.
    if (!tenant || !tenant.enabledModules.includes(required)) {
      throw new ForbiddenException(
        `Your organization doesn't have the "${required}" module enabled. Contact your tmPro administrator.`,
      );
    }
    return true;
  }
}
