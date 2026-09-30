import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { EmployeesService } from '../employees/employees.service';
import { ContractInput, ContractsService } from './contracts.service';

/** v028.F — Job tab → Contract, and the gratuity report. Reading follows the
 *  profile's visibility rule; changing a contract is Admin/HR only. */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContractsController {
  constructor(
    private contracts: ContractsService,
    private employees: EmployeesService,
  ) {}

  @Get('employees/:employeeId/contracts')
  @Roles('ADMIN', 'SUPERVISOR', 'EMPLOYEE', 'HR')
  async list(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string) {
    await this.employees.assertVisible(user.tenantId, user, employeeId);
    return this.contracts.list(user.tenantId, employeeId);
  }

  @Post('employees/:employeeId/contracts')
  @Roles('ADMIN', 'HR')
  add(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string, @Body() body: ContractInput) {
    return this.contracts.add(user.tenantId, employeeId, user.userId ?? null, body ?? {});
  }

  @Patch('employees/:employeeId/contracts/:id')
  @Roles('ADMIN', 'HR')
  update(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string, @Param('id') id: string, @Body() body: ContractInput) {
    return this.contracts.update(user.tenantId, employeeId, id, body ?? {});
  }

  @Delete('employees/:employeeId/contracts/:id')
  @Roles('ADMIN', 'HR')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string, @Param('id') id: string) {
    return this.contracts.remove(user.tenantId, employeeId, id);
  }

  @Get('contracts/expiring')
  @Roles('ADMIN', 'HR')
  expiring(@CurrentUser() user: AuthenticatedUser) {
    return this.contracts.expiring(user.tenantId, 6);
  }

  @Get('contracts/gratuity-liability')
  @Roles('ADMIN', 'HR')
  liability(@CurrentUser() user: AuthenticatedUser) {
    return this.contracts.liability(user.tenantId);
  }
}
