import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private dashboard: DashboardService) {}

  @Get('admin-summary')
  @Roles('ADMIN', 'HR')
  adminSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.adminSummary(user.tenantId);
  }

  @Get('supervisor-summary')
  @Roles('SUPERVISOR')
  supervisorSummary(@CurrentUser() user: AuthenticatedUser) {
    if (!user.employeeId) {
      return { directReportsCount: 0, pendingRequestsCount: 0, onLeave: [], pendingRequests: [], birthdays: [] };
    }
    return this.dashboard.supervisorSummary(user.tenantId, user.employeeId);
  }
}
