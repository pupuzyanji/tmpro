import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ModuleGuard } from '../../common/guards/module.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequiresModule } from '../../common/decorators/requires-module.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PerformanceService } from './performance.service';
import { CreateGoalDto, UpdateGoalStatusDto } from './dto/goal.dto';

@Controller('performance/goals')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
@RequiresModule('Performance Management')
export class PerformanceController {
  constructor(private performance: PerformanceService) {}

  @Get('me')
  myGoals(@CurrentUser() user: AuthenticatedUser) {
    if (!user.employeeId) return [];
    return this.performance.myGoals(user.tenantId, user.employeeId);
  }

  /** Read-only view of any employee's goals — backs the Performance tab on their People profile. */
  @Get('employee/:id')
  @Roles('ADMIN', 'SUPERVISOR', 'HR')
  employeeGoals(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.performance.myGoals(user.tenantId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateGoalDto) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile on this account.');
    return this.performance.create(user.tenantId, user.employeeId, dto);
  }

  @Patch(':id/status')
  updateStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateGoalStatusDto) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile on this account.');
    return this.performance.updateStatus(user.tenantId, user.employeeId, id, dto);
  }
}
