import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ModuleGuard } from '../../common/guards/module.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequiresModule } from '../../common/decorators/requires-module.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { TimesheetsService } from './timesheets.service';
import { CreateTimesheetDto, CreateWeeklyTimesheetDto, UpdateTimesheetDto } from './dto/timesheet.dto';

/** Gated behind the Timesheets module (tenant-level) *and*, inside the
 *  service, behind an employee's own timesheetsEnabled flag (Admin/HR
 *  "allocation" — see schema.ts) — the module toggle is the tenant opting
 *  in at all, the per-employee flag is who within that tenant actually uses
 *  it. */
@Controller('timesheets')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
@RequiresModule('Timesheets')
export class TimesheetsController {
  constructor(private timesheets: TimesheetsService) {}

  @Get('me')
  myTimesheets(@CurrentUser() user: AuthenticatedUser) {
    if (!user.employeeId) return [];
    return this.timesheets.myTimesheets(user.tenantId, user.employeeId);
  }

  @Get('team')
  @Roles('SUPERVISOR', 'ADMIN', 'HR')
  teamTimesheets(@CurrentUser() user: AuthenticatedUser) {
    if (!user.employeeId) return [];
    return this.timesheets.teamTimesheets(user.tenantId, user.employeeId);
  }

  /** Every timesheet on the tenant — Admin/HR's whole-org review list,
   *  since they're the ones who allocate the feature in the first place and
   *  aren't necessarily anyone's direct manager. */
  @Get()
  @Roles('ADMIN', 'HR')
  allTimesheets(@CurrentUser() user: AuthenticatedUser) {
    return this.timesheets.allTimesheets(user.tenantId);
  }

  @Post()
  @Roles('EMPLOYEE', 'SUPERVISOR', 'ADMIN', 'HR')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTimesheetDto) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile on this account.');
    return this.timesheets.create(user.tenantId, user.employeeId, dto);
  }

  @Post('weekly')
  @Roles('EMPLOYEE', 'SUPERVISOR', 'ADMIN', 'HR')
  createWeekly(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateWeeklyTimesheetDto) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile on this account.');
    return this.timesheets.createMany(user.tenantId, user.employeeId, dto);
  }

  @Patch(':id')
  @Roles('EMPLOYEE', 'SUPERVISOR', 'ADMIN', 'HR')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateTimesheetDto) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile on this account.');
    return this.timesheets.update(user.tenantId, user.employeeId, id, dto);
  }

  @Delete(':id')
  @Roles('EMPLOYEE', 'SUPERVISOR', 'ADMIN', 'HR')
  delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile on this account.');
    return this.timesheets.delete(user.tenantId, user.employeeId, id);
  }

  @Post(':id/approve')
  @Roles('SUPERVISOR', 'ADMIN', 'HR')
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.timesheets.decide(user.tenantId, id, user.employeeId ?? null, user.role, 'APPROVED');
  }

  @Post(':id/decline')
  @Roles('SUPERVISOR', 'ADMIN', 'HR')
  decline(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.timesheets.decide(user.tenantId, id, user.employeeId ?? null, user.role, 'DECLINED');
  }
}
