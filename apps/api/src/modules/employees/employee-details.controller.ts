import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { EmployeesService } from './employees.service';
import { EmployeeDetailsService } from './employee-details.service';
import {
  CreateDependentDto,
  CreateEducationDto,
  CreateWorkExperienceDto,
  UpdateDependentDto,
  UpdateEducationDto,
  UpdateWorkExperienceDto,
} from './dto/employee-sub-resources.dto';

/** General Info tab's three addable sub-lists. Read access follows the same
 *  visibility rule as the profile itself (Admin: anyone, Supervisor: their
 *  team, Employee: themselves); adding/removing entries is Admin-only, same
 *  as every other edit on the People profile. */
@Controller('employees/:employeeId')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPERVISOR', 'EMPLOYEE', 'HR')
export class EmployeeDetailsController {
  constructor(
    private employees: EmployeesService,
    private details: EmployeeDetailsService,
  ) {}

  // --- Work Experience ---------------------------------------------------

  @Get('work-experience')
  async listWorkExperience(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string) {
    await this.employees.assertVisible(user.tenantId, user, employeeId);
    return this.details.listWorkExperience(user.tenantId, employeeId);
  }

  @Post('work-experience')
  @Roles('ADMIN', 'HR')
  addWorkExperience(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Body() dto: CreateWorkExperienceDto,
  ) {
    return this.details.addWorkExperience(user.tenantId, employeeId, dto);
  }

  @Patch('work-experience/:id')
  @Roles('ADMIN', 'HR')
  updateWorkExperience(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWorkExperienceDto,
  ) {
    return this.details.updateWorkExperience(user.tenantId, employeeId, id, dto);
  }

  @Delete('work-experience/:id')
  @Roles('ADMIN', 'HR')
  deleteWorkExperience(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
  ) {
    return this.details.deleteWorkExperience(user.tenantId, employeeId, id);
  }

  // --- Education -------------------------------------------------------

  @Get('education')
  async listEducation(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string) {
    await this.employees.assertVisible(user.tenantId, user, employeeId);
    return this.details.listEducation(user.tenantId, employeeId);
  }

  @Post('education')
  @Roles('ADMIN', 'HR')
  addEducation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Body() dto: CreateEducationDto,
  ) {
    return this.details.addEducation(user.tenantId, employeeId, dto);
  }

  @Patch('education/:id')
  @Roles('ADMIN', 'HR')
  updateEducation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEducationDto,
  ) {
    return this.details.updateEducation(user.tenantId, employeeId, id, dto);
  }

  @Delete('education/:id')
  @Roles('ADMIN', 'HR')
  deleteEducation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
  ) {
    return this.details.deleteEducation(user.tenantId, employeeId, id);
  }

  // --- Dependents ------------------------------------------------------

  @Get('dependents')
  async listDependents(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string) {
    await this.employees.assertVisible(user.tenantId, user, employeeId);
    return this.details.listDependents(user.tenantId, employeeId);
  }

  @Post('dependents')
  @Roles('ADMIN', 'HR')
  addDependent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Body() dto: CreateDependentDto,
  ) {
    return this.details.addDependent(user.tenantId, employeeId, dto);
  }

  @Patch('dependents/:id')
  @Roles('ADMIN', 'HR')
  updateDependent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDependentDto,
  ) {
    return this.details.updateDependent(user.tenantId, employeeId, id, dto);
  }

  @Delete('dependents/:id')
  @Roles('ADMIN', 'HR')
  deleteDependent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
  ) {
    return this.details.deleteDependent(user.tenantId, employeeId, id);
  }
}
