import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ModuleGuard } from '../../common/guards/module.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequiresModule } from '../../common/decorators/requires-module.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';

/** Every route: Admin sees the whole tenant, Supervisor sees their direct
 *  reports only (scoped inside the service) — same visibility rule as the
 *  rest of the app. "Unresponded requests per supervisor" is Admin-only
 *  since it's inherently a cross-team breakdown, not a per-employee list. */
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
@Roles('ADMIN', 'SUPERVISOR', 'HR')
@RequiresModule('Reports & Analytics')
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get('leave-accumulated')
  leaveAccumulated(@CurrentUser() user: AuthenticatedUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.leaveAccumulated(user.tenantId, user, { from, to });
  }

  @Get('goals-set')
  goalsSet(@CurrentUser() user: AuthenticatedUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.goalsSet(user.tenantId, user, { from, to });
  }

  @Get('appraisals-conducted')
  appraisalsConducted(@CurrentUser() user: AuthenticatedUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.appraisalsConducted(user.tenantId, user, { from, to });
  }

  @Get('unresponded-requests')
  @Roles('ADMIN', 'HR')
  unrespondedRequests(@CurrentUser() user: AuthenticatedUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.unrespondedRequestsBySupervisor(user.tenantId, { from, to });
  }

  @Get('contracts-missing')
  contractsMissing(@CurrentUser() user: AuthenticatedUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.contractsMissing(user.tenantId, user, { from, to });
  }

  @Get('ids-missing')
  idsMissing(@CurrentUser() user: AuthenticatedUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.idsMissing(user.tenantId, user, { from, to });
  }
}
