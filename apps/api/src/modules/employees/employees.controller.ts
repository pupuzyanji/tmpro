import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IMAGE_MIME_TYPES, assertMimeType, toDataUri } from '../../common/uploads/file.util';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeRoleDto } from './dto/update-employee-role.dto';
import { UpdateAccountEmailDto } from './dto/update-account-email.dto';

@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployeesController {
  constructor(private employees: EmployeesService) {}

  /** The People directory. Visible to every signed-in role — what each person
   *  actually sees is scoped in the service: Admin gets the full org, a
   *  Supervisor gets their team plus themselves, an Employee gets just their
   *  own record. */
  @Get()
  @Roles('ADMIN', 'SUPERVISOR', 'EMPLOYEE', 'HR')
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.employees.findVisible(user.tenantId, user);
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    if (!user.employeeId) throw new NotFoundException('No employee profile on this account.');
    return this.employees.findById(user.tenantId, user.employeeId);
  }

  @Get('team')
  @Roles('SUPERVISOR', 'ADMIN', 'HR')
  async team(@CurrentUser() user: AuthenticatedUser) {
    if (!user.employeeId) return [];
    return this.employees.findReports(user.tenantId, user.employeeId);
  }

  @Get(':id')
  @Roles('ADMIN', 'SUPERVISOR', 'EMPLOYEE', 'HR')
  async findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.employees.assertVisible(user.tenantId, user, id);
    return this.employees.findDetail(user.tenantId, id);
  }

  @Post()
  @Roles('ADMIN', 'HR')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEmployeeDto) {
    return this.employees.create(user.tenantId, dto);
  }

  @Patch(':id')
  @Roles('ADMIN', 'HR')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employees.update(user.tenantId, id, dto);
  }

  /** People profile → Permission tab's role editor (v019.A). Admin or HR;
   *  the service itself blocks changing your own role, so this can't be
   *  used to self-escalate. */
  @Patch(':id/role')
  @Roles('ADMIN', 'HR')
  updateRole(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateEmployeeRoleDto) {
    return this.employees.updateRole(user.tenantId, id, dto.role, user);
  }

  /** Settings → Employees "Data Import". Same shared CSV-parsing pattern as
   *  the Settings module's Branches/Departments/Designations imports. */
  @Post('import')
  @Roles('ADMIN', 'HR')
  @UseInterceptors(FileInterceptor('file'))
  importEmployees(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: Express.Multer.File) {
    return this.employees.importEmployees(user.tenantId, file.buffer);
  }

  /** Bulk-creates login accounts for every employee who doesn't have one yet
   *  (personal email as the login, Supervisor if they have direct reports,
   *  Employee otherwise, one shared default password) — Settings → Employees. */
  @Post('generate-logins')
  @Roles('ADMIN', 'HR')
  generateLogins(@CurrentUser() user: AuthenticatedUser) {
    return this.employees.generateLogins(user.tenantId);
  }

  /** Single-employee "Generate Login" — People profile → Permission tab,
   *  below the role editor. Same rules as the bulk path above, applied to
   *  just this one person. */
  @Post(':id/generate-login')
  @Roles('ADMIN', 'HR')
  generateLogin(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.employees.generateLogin(user.tenantId, id);
  }

  /** People profile → Permission tab's "Reset password" — the counterpart
   *  to Generate Login above for someone who already has an account. Emails
   *  a one-time reset link; see EmployeesService.resetPassword(). */
  @Post(':id/reset-password')
  @Roles('ADMIN', 'HR')
  resetPassword(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.employees.resetPassword(user.tenantId, id);
  }

  /** People profile → Permission tab's "Account email" editor (v023.A). */
  @Patch(':id/account-email')
  @Roles('ADMIN', 'HR')
  updateAccountEmail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateAccountEmailDto) {
    return this.employees.updateAccountEmail(user.tenantId, id, dto.email);
  }

  /** Portrait photo — Settings → Employees setup, or the People profile edit.
   *  Admin/HR, same as every other edit on an employee record. */
  @Post(':id/photo')
  @Roles('ADMIN', 'HR')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 3 * 1024 * 1024 } }))
  async uploadPhoto(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @UploadedFile() file: Express.Multer.File) {
    assertMimeType(file, IMAGE_MIME_TYPES, 'photo');
    return this.employees.update(user.tenantId, id, { photoUrl: toDataUri(file) });
  }
}
