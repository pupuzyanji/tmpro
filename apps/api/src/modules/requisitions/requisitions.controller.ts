import { Body, Controller, ForbiddenException, Get, Headers, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ModuleGuard } from '../../common/guards/module.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequiresModule } from '../../common/decorators/requires-module.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequisitionsService } from './requisitions.service';
import { CreateRequisitionDto, UpdateRequisitionDto, ApplyDto } from './dto/requisition.dto';

// Every route below except `apply` is internal (Admin/Supervisor), gated
// behind the Recruitment module. `apply` stays reachable even for a tenant
// without Recruitment — CareersModule's public listing is separately
// ungated, and gating apply too would just 403 a candidate mid-application
// for something outside their control. Disabling Recruitment stops new
// requisitions from being raised/approved, which naturally stops new
// postings from appearing, without needing to also block this endpoint.
@Controller('requisitions')
export class RequisitionsController {
  constructor(private requisitions: RequisitionsService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
  @Roles('ADMIN', 'SUPERVISOR', 'HR')
  @RequiresModule('Recruitment')
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.requisitions.findAll(user.tenantId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
  @Roles('SUPERVISOR', 'ADMIN', 'HR')
  @RequiresModule('Recruitment')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRequisitionDto) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile on this account.');
    return this.requisitions.create(user.tenantId, user.employeeId, dto);
  }

  @Post(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
  @Roles('ADMIN', 'HR')
  @RequiresModule('Recruitment')
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.requisitions.approve(user.tenantId, id, user.employeeId ?? null);
  }

  /** Edits a requisition, including the public careers-page content (role summary, what you'll do/bring/get, why us). */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
  @Roles('SUPERVISOR', 'ADMIN', 'HR')
  @RequiresModule('Recruitment')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateRequisitionDto) {
    return this.requisitions.update(user.tenantId, id, dto);
  }

  @Get(':id/candidates')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
  @Roles('ADMIN', 'SUPERVISOR', 'HR')
  @RequiresModule('Recruitment')
  candidates(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.requisitions.listCandidates(user.tenantId, id);
  }

  /** Public — a job candidate applying has no account yet. Tenant comes from the career-site header. */
  @Post(':id/apply')
  apply(@Headers('x-tenant-slug') tenantSlug: string, @Param('id') id: string, @Body() dto: ApplyDto) {
    return this.requisitions.apply(tenantSlug, id, dto);
  }
}
