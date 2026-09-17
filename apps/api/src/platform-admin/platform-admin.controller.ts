import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RateLimitGuard } from '../auth/rate-limit.guard';
import { PlatformAdminAuthService } from './platform-admin-auth.service';
import { PlatformAdminJwtAuthGuard } from './platform-admin-jwt-auth.guard';
import { TenantsAdminService } from './tenants-admin.service';
import { OrgSignupsAdminService } from './org-signups-admin.service';
import { PlatformAdminLoginDto } from './dto/platform-admin-login.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Controller('platform-admin/auth')
export class PlatformAdminAuthController {
  constructor(private auth: PlatformAdminAuthService) {}

  // Same throttling shape as /auth/identify — a platform-admin login is a
  // much smaller, higher-value credential set than a tenant login.
  @Post('login')
  @UseGuards(RateLimitGuard(8, 5 * 60_000))
  login(@Body() dto: PlatformAdminLoginDto) {
    return this.auth.login(dto);
  }
}

/** Cross-tenant tenant management for the platform owner (v019.A): create,
 *  edit, activate/deactivate and delete tenants, and manage each one's
 *  module entitlements, seat cap and admin login. Nothing here is reachable
 *  with a tenant-scoped JWT — PlatformAdminJwtAuthGuard only accepts a
 *  `scope: 'platform'` token from the controller above. */
@Controller('platform-admin/tenants')
@UseGuards(PlatformAdminJwtAuthGuard)
export class TenantsAdminController {
  constructor(private tenantsAdmin: TenantsAdminService) {}

  @Get()
  list() {
    return this.tenantsAdmin.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.tenantsAdmin.get(id);
  }

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsAdmin.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.tenantsAdmin.update(id, dto);
  }

  @Post(':id/activate')
  activate(@Param('id') id: string) {
    return this.tenantsAdmin.activate(id);
  }

  @Post(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.tenantsAdmin.deactivate(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tenantsAdmin.remove(id);
  }
}

/** Read-only list of "Register your organisation" leads for the Pending
 *  Applications tab — see OrgSignupsAdminService. */
@Controller('platform-admin/org-signups')
@UseGuards(PlatformAdminJwtAuthGuard)
export class OrgSignupsAdminController {
  constructor(private orgSignupsAdmin: OrgSignupsAdminService) {}

  @Get()
  list() {
    return this.orgSignupsAdmin.list();
  }
}
