import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { EmployeesService } from './employees.service';
import { EmployeePerformanceService } from './employee-performance.service';
import {
  CreateCommentDto,
  CreateEmployeeGoalDto,
  CreateReviewEntryDto,
  UpdateCommentDto,
  UpdateEmployeeGoalDto,
  UpdateReviewEntryDto,
} from './dto/employee-performance.dto';

/** Performance tab on the People profile: Reviews / Comments / Goals. Read
 *  access follows profile visibility (Admin: anyone, Supervisor: their
 *  team, Employee: themselves); adding or editing an entry is Admin-only,
 *  same as every other edit on the People profile. */
@Controller('employees/:employeeId/performance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPERVISOR', 'EMPLOYEE', 'HR')
export class EmployeePerformanceController {
  constructor(
    private employees: EmployeesService,
    private performance: EmployeePerformanceService,
  ) {}

  // --- Reviews -----------------------------------------------------------

  @Get('reviews')
  async listReviews(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string) {
    await this.employees.assertVisible(user.tenantId, user, employeeId);
    return this.performance.listReviews(user.tenantId, employeeId);
  }

  @Post('reviews')
  @Roles('ADMIN', 'HR')
  addReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Body() dto: CreateReviewEntryDto,
  ) {
    return this.performance.addReview(user.tenantId, employeeId, dto);
  }

  @Patch('reviews/:id')
  @Roles('ADMIN', 'HR')
  updateReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
    @Body() dto: UpdateReviewEntryDto,
  ) {
    return this.performance.updateReview(user.tenantId, employeeId, id, dto);
  }

  @Delete('reviews/:id')
  @Roles('ADMIN', 'HR')
  deleteReview(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string, @Param('id') id: string) {
    return this.performance.deleteReview(user.tenantId, employeeId, id);
  }

  // --- Comments ------------------------------------------------------

  @Get('comments')
  async listComments(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string) {
    await this.employees.assertVisible(user.tenantId, user, employeeId);
    return this.performance.listComments(user.tenantId, employeeId);
  }

  @Post('comments')
  @Roles('ADMIN', 'HR')
  addComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.performance.addComment(user.tenantId, employeeId, dto);
  }

  @Patch('comments/:id')
  @Roles('ADMIN', 'HR')
  updateComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.performance.updateComment(user.tenantId, employeeId, id, dto);
  }

  @Delete('comments/:id')
  @Roles('ADMIN', 'HR')
  deleteComment(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string, @Param('id') id: string) {
    return this.performance.deleteComment(user.tenantId, employeeId, id);
  }

  // --- Goals ---------------------------------------------------------

  @Get('goals')
  async listGoals(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string) {
    await this.employees.assertVisible(user.tenantId, user, employeeId);
    return this.performance.listGoals(user.tenantId, employeeId);
  }

  @Post('goals')
  @Roles('ADMIN', 'HR')
  addGoal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Body() dto: CreateEmployeeGoalDto,
  ) {
    return this.performance.addGoal(user.tenantId, employeeId, dto);
  }

  @Patch('goals/:id')
  @Roles('ADMIN', 'HR')
  updateGoal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeGoalDto,
  ) {
    return this.performance.updateGoal(user.tenantId, employeeId, id, dto);
  }
}
