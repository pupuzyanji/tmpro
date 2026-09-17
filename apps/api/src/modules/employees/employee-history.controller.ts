import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { EmployeesService } from './employees.service';
import { EmployeeHistoryService } from './employee-history.service';
import {
  AddCompensationHistoryDto,
  AddJobHistoryDto,
  AddStatusHistoryDto,
  AddTypeHistoryDto,
  UpdateCompensationHistoryDto,
  UpdateJobHistoryDto,
  UpdateStatusHistoryDto,
  UpdateTypeHistoryDto,
} from './dto/employee-history.dto';

/** Backs the Job tab's four dated history sections. Read access follows the
 *  same visibility rule as the profile itself (Admin: anyone, Supervisor:
 *  their team, Employee: themselves); adding or editing a dated entry is
 *  Admin-only, same as every other edit on the People profile. */
@Controller('employees/:employeeId/history')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPERVISOR', 'EMPLOYEE', 'HR')
export class EmployeeHistoryController {
  constructor(
    private employees: EmployeesService,
    private history: EmployeeHistoryService,
  ) {}

  // --- Employee Status -----------------------------------------------

  @Get('status')
  async listStatusHistory(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string) {
    await this.employees.assertVisible(user.tenantId, user, employeeId);
    return this.history.listStatusHistory(user.tenantId, employeeId);
  }

  @Post('status')
  @Roles('ADMIN', 'HR')
  addStatusHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Body() dto: AddStatusHistoryDto,
  ) {
    return this.history.addStatusHistory(user.tenantId, employeeId, user.employeeId ?? null, dto);
  }

  @Patch('status/:id')
  @Roles('ADMIN', 'HR')
  updateStatusHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStatusHistoryDto,
  ) {
    return this.history.updateStatusHistory(user.tenantId, employeeId, id, dto);
  }

  @Delete('status/:id')
  @Roles('ADMIN', 'HR')
  deleteStatusHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
  ) {
    return this.history.deleteStatusHistory(user.tenantId, employeeId, id);
  }

  // --- Employment Type -------------------------------------------------

  @Get('employment-type')
  async listTypeHistory(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string) {
    await this.employees.assertVisible(user.tenantId, user, employeeId);
    return this.history.listTypeHistory(user.tenantId, employeeId);
  }

  @Post('employment-type')
  @Roles('ADMIN', 'HR')
  addTypeHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Body() dto: AddTypeHistoryDto,
  ) {
    return this.history.addTypeHistory(user.tenantId, employeeId, user.employeeId ?? null, dto);
  }

  @Patch('employment-type/:id')
  @Roles('ADMIN', 'HR')
  updateTypeHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTypeHistoryDto,
  ) {
    return this.history.updateTypeHistory(user.tenantId, employeeId, id, dto);
  }

  @Delete('employment-type/:id')
  @Roles('ADMIN', 'HR')
  deleteTypeHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
  ) {
    return this.history.deleteTypeHistory(user.tenantId, employeeId, id);
  }

  // --- Compensation ------------------------------------------------------

  @Get('compensation')
  async listCompensationHistory(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string) {
    await this.employees.assertVisible(user.tenantId, user, employeeId);
    return this.history.listCompensationHistory(user.tenantId, employeeId);
  }

  @Post('compensation')
  @Roles('ADMIN', 'HR')
  addCompensationHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Body() dto: AddCompensationHistoryDto,
  ) {
    return this.history.addCompensationHistory(user.tenantId, employeeId, user.employeeId ?? null, dto);
  }

  @Patch('compensation/:id')
  @Roles('ADMIN', 'HR')
  updateCompensationHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCompensationHistoryDto,
  ) {
    return this.history.updateCompensationHistory(user.tenantId, employeeId, id, dto);
  }

  @Delete('compensation/:id')
  @Roles('ADMIN', 'HR')
  deleteCompensationHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
  ) {
    return this.history.deleteCompensationHistory(user.tenantId, employeeId, id);
  }

  // --- Job Information ---------------------------------------------------

  @Get('job-info')
  async listJobHistory(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string) {
    await this.employees.assertVisible(user.tenantId, user, employeeId);
    return this.history.listJobHistory(user.tenantId, employeeId);
  }

  @Post('job-info')
  @Roles('ADMIN', 'HR')
  addJobHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Body() dto: AddJobHistoryDto,
  ) {
    return this.history.addJobHistory(user.tenantId, employeeId, user.employeeId ?? null, dto);
  }

  @Patch('job-info/:id')
  @Roles('ADMIN', 'HR')
  updateJobHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
    @Body() dto: UpdateJobHistoryDto,
  ) {
    return this.history.updateJobHistory(user.tenantId, employeeId, id, dto);
  }

  @Delete('job-info/:id')
  @Roles('ADMIN', 'HR')
  deleteJobHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
  ) {
    return this.history.deleteJobHistory(user.tenantId, employeeId, id);
  }
}
