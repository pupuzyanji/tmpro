import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { db, withTenant } from '../db/client';
import { tenants, users } from '../db/schema';
import { CORE_MODULE_KEYS } from '../common/modules/module-catalog';
import { countSeatsUsed } from '../common/seats/seat-policy';
import type { CreateTenantDto } from './dto/create-tenant.dto';
import type { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsAdminService {
  async list() {
    const rows = await db.select().from(tenants).orderBy(tenants.name);
    return Promise.all(rows.map((t) => this.toDto(t)));
  }

  async get(id: string) {
    const [t] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
    if (!t) throw new NotFoundException('Tenant not found.');
    return this.toDto(t);
  }

  /** Add Tenant: creates the tenant row (always INACTIVE — see the
   *  `tenants.status` column default) and its first ADMIN login in one
   *  transaction-ish pair of writes. `users` is RLS-scoped, so the login
   *  insert has to go through withTenant() once the tenant row (and its id)
   *  exist. */
  async create(dto: CreateTenantDto) {
    const email = dto.adminEmail.trim().toLowerCase();
    const slug = await this.uniqueSlug(dto.organisationName);
    const enabledModules = this.withCoreModules(dto.enabledModules ?? []);

    const [tenantRow] = await db
      .insert(tenants)
      .values({
        slug,
        name: dto.organisationName.trim(),
        enabledModules,
        seatCap: dto.seatCap ?? null,
      })
      .returning();

    try {
      await withTenant(tenantRow.id, async (tx) => {
        await tx.insert(users).values({
          tenantId: tenantRow.id,
          email,
          passwordHash: await bcrypt.hash(dto.password, 10),
          role: 'ADMIN',
          firstName: dto.adminFirstName.trim(),
          lastName: dto.adminLastName.trim(),
        });
      });
    } catch (err) {
      // Roll back the tenant row so a duplicate admin email doesn't leave an
      // orphaned, login-less tenant behind — users_tenant_email_uq is scoped
      // per-tenant so this can only collide within the row we just made.
      await db.delete(tenants).where(eq(tenants.id, tenantRow.id));
      if (this.isUniqueViolation(err)) throw new ConflictException('That admin email is already in use.');
      throw err;
    }

    return this.toDto(tenantRow);
  }

  async update(id: string, dto: UpdateTenantDto) {
    const [existing] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
    if (!existing) throw new NotFoundException('Tenant not found.');

    const patch: Partial<typeof tenants.$inferInsert> = {};
    if (dto.organisationName !== undefined) patch.name = dto.organisationName.trim();
    if (dto.enabledModules !== undefined) patch.enabledModules = this.withCoreModules(dto.enabledModules);
    if ('seatCap' in dto) patch.seatCap = dto.seatCap ?? null;

    const [row] = Object.keys(patch).length
      ? await db.update(tenants).set(patch).where(eq(tenants.id, id)).returning()
      : [existing];

    const wantsAdminUpdate =
      dto.adminFirstName !== undefined ||
      dto.adminLastName !== undefined ||
      dto.adminEmail !== undefined ||
      dto.password !== undefined;

    if (wantsAdminUpdate) {
      await withTenant(id, async (tx) => {
        const [admin] = await tx.select().from(users).where(and(eq(users.tenantId, id), eq(users.role, 'ADMIN'))).limit(1);
        if (!admin) {
          throw new BadRequestException('This tenant has no admin login to edit yet.');
        }
        const adminPatch: Partial<typeof users.$inferInsert> = {};
        if (dto.adminFirstName !== undefined) adminPatch.firstName = dto.adminFirstName.trim();
        if (dto.adminLastName !== undefined) adminPatch.lastName = dto.adminLastName.trim();
        if (dto.adminEmail !== undefined) adminPatch.email = dto.adminEmail.trim().toLowerCase();
        if (dto.password !== undefined) adminPatch.passwordHash = await bcrypt.hash(dto.password, 10);
        try {
          await tx.update(users).set(adminPatch).where(eq(users.id, admin.id));
        } catch (err) {
          if (this.isUniqueViolation(err)) throw new ConflictException('That admin email is already in use.');
          throw err;
        }
      });
    }

    return this.toDto(row);
  }

  async activate(id: string) {
    return this.setStatus(id, 'ACTIVE');
  }

  /** Moves an active tenant back to the Inactive tab. Its users stay in the
   *  database — nothing is deleted — but AuthService.login() refuses them
   *  with a "contact support" message until the tenant is reactivated. */
  async deactivate(id: string) {
    return this.setStatus(id, 'INACTIVE');
  }

  /** Only ever offered from the Inactive tab. Cascades — see the ON DELETE
   *  CASCADE added to every tenant-scoped table's tenant_id FK in
   *  drizzle/0021 — so this one statement also removes every employee,
   *  leave request, payslip, etc. that belonged to this tenant. */
  async remove(id: string) {
    const [row] = await db.delete(tenants).where(eq(tenants.id, id)).returning({ id: tenants.id });
    if (!row) throw new NotFoundException('Tenant not found.');
    return { id: row.id };
  }

  private async setStatus(id: string, status: 'ACTIVE' | 'INACTIVE') {
    const [row] = await db.update(tenants).set({ status }).where(eq(tenants.id, id)).returning();
    if (!row) throw new NotFoundException('Tenant not found.');
    return this.toDto(row);
  }

  private withCoreModules(modules: string[]): string[] {
    const set = new Set(modules);
    for (const key of CORE_MODULE_KEYS) set.add(key);
    return [...set];
  }

  private async uniqueSlug(organisationName: string) {
    const base =
      organisationName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'tenant';

    const existing = new Set((await db.select({ slug: tenants.slug }).from(tenants)).map((t) => t.slug));
    if (!existing.has(base)) return base;
    for (let n = 2; ; n++) {
      const candidate = `${base}-${n}`;
      if (!existing.has(candidate)) return candidate;
    }
  }

  private isUniqueViolation(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
  }

  private async toDto(t: typeof tenants.$inferSelect) {
    const admin = await withTenant(t.id, async (tx) => {
      const [row] = await tx.select().from(users).where(and(eq(users.tenantId, t.id), eq(users.role, 'ADMIN'))).limit(1);
      return row ?? null;
    });
    return {
      id: t.id,
      slug: t.slug,
      name: t.name,
      status: t.status,
      enabledModules: t.enabledModules,
      seatCap: t.seatCap,
      seatsUsed: await countSeatsUsed(t.id),
      createdAt: t.createdAt,
      admin: admin
        ? { firstName: admin.firstName, lastName: admin.lastName, email: admin.email }
        : null,
    };
  }
}
