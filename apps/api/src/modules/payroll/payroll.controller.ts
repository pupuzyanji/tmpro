import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ModuleGuard } from '../../common/guards/module.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequiresModule } from '../../common/decorators/requires-module.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PayrollService } from './payroll.service';
import { RunPayrollDto, UpdatePayRunDto } from './dto/run-payroll.dto';
import { CreatePayrollAdjustmentDto, UpdatePayrollAdjustmentDto } from './dto/payroll-adjustment.dto';

@Controller('payroll')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
@RequiresModule('Payroll')
export class PayrollController {
  constructor(private payroll: PayrollService) {}

  @Get('runs')
  @Roles('ADMIN', 'HR')
  listRuns(@CurrentUser() user: AuthenticatedUser) {
    return this.payroll.listRuns(user.tenantId);
  }

  @Post('runs')
  @Roles('ADMIN', 'HR')
  runPayroll(@CurrentUser() user: AuthenticatedUser, @Body() dto: RunPayrollDto) {
    return this.payroll.runPayroll(user.tenantId, user.employeeId ?? null, dto);
  }

  @Get('runs/:id/payslips')
  @Roles('ADMIN', 'HR')
  payslips(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.payroll.listPayslips(user.tenantId, id);
  }

  @Patch('runs/:id')
  @Roles('ADMIN', 'HR')
  updateRun(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdatePayRunDto) {
    return this.payroll.updateRun(user.tenantId, id, dto);
  }

  @Delete('runs/:id')
  @Roles('ADMIN', 'HR')
  deleteRun(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.payroll.deleteRun(user.tenantId, id);
  }

  @Post('runs/:id/mark-paid')
  @Roles('ADMIN', 'HR')
  markPaid(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.payroll.markPaid(user.tenantId, id);
  }

  @Get('payslips/me')
  myPayslips(@CurrentUser() user: AuthenticatedUser) {
    if (!user.employeeId) return [];
    return this.payroll.myPayslips(user.tenantId, user.employeeId);
  }

  // --- Ad-hoc additions/deductions (advances, bonuses, etc.) --------------

  @Get('adjustments')
  @Roles('ADMIN', 'HR')
  listAdjustments(@CurrentUser() user: AuthenticatedUser, @Query('employeeId') employeeId?: string) {
    return this.payroll.listAdjustments(user.tenantId, employeeId);
  }

  @Post('adjustments')
  @Roles('ADMIN', 'HR')
  createAdjustments(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePayrollAdjustmentDto) {
    return this.payroll.createAdjustments(user.tenantId, user.employeeId ?? null, dto);
  }

  @Patch('adjustments/:id')
  @Roles('ADMIN', 'HR')
  updateAdjustment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePayrollAdjustmentDto,
  ) {
    return this.payroll.updateAdjustment(user.tenantId, id, dto);
  }

  @Delete('adjustments/:id')
  @Roles('ADMIN', 'HR')
  cancelAdjustment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.payroll.cancelAdjustment(user.tenantId, id);
  }
}
