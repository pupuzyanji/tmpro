import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ModuleGuard } from '../../common/guards/module.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequiresModule } from '../../common/decorators/requires-module.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { LeaveService } from './leave.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';

@Controller('leave')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
@RequiresModule('Leave & Attendance')
export class LeaveController {
  constructor(private leave: LeaveService) {}

  @Get('types')
  types(@CurrentUser() user: AuthenticatedUser) {
    return this.leave.listTypes(user.tenantId);
  }

  @Get('balances/me')
  myBalances(@CurrentUser() user: AuthenticatedUser) {
    if (!user.employeeId) return [];
    return this.leave.myBalances(user.tenantId, user.employeeId);
  }

  @Get('requests/me')
  myRequests(@CurrentUser() user: AuthenticatedUser) {
    if (!user.employeeId) return [];
    return this.leave.myRequests(user.tenantId, user.employeeId);
  }

  @Get('requests/team')
  @Roles('SUPERVISOR', 'ADMIN', 'HR')
  teamRequests(@CurrentUser() user: AuthenticatedUser) {
    if (!user.employeeId) return [];
    return this.leave.teamRequests(user.tenantId, user.employeeId);
  }

  /** Read-only view of any employee's leave — backs the Leave tab on their People profile. */
  @Get('balances/employee/:id')
  @Roles('ADMIN', 'SUPERVISOR', 'HR')
  employeeBalances(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.leave.myBalances(user.tenantId, id);
  }

  @Get('requests/employee/:id')
  @Roles('ADMIN', 'SUPERVISOR', 'HR')
  employeeRequests(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.leave.myRequests(user.tenantId, id);
  }

  @Post('requests')
  @Roles('EMPLOYEE', 'SUPERVISOR')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLeaveRequestDto) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile on this account.');
    return this.leave.create(user.tenantId, user.employeeId, dto);
  }

  @Post('requests/:id/approve')
  @Roles('SUPERVISOR', 'ADMIN', 'HR')
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.leave.decide(user.tenantId, id, user.employeeId ?? null, user.role, 'APPROVED');
  }

  @Post('requests/:id/decline')
  @Roles('SUPERVISOR', 'ADMIN', 'HR')
  decline(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.leave.decide(user.tenantId, id, user.employeeId ?? null, user.role, 'DECLINED');
  }
}
