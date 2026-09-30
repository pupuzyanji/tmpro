import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ModuleGuard } from '../../common/guards/module.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequiresModule } from '../../common/decorators/requires-module.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PayrollService } from './payroll.service';
import { ApprovalSettingsDto, CanApproveDto, PayRunActionDto, RunPayrollDto, UpdatePayRunDto } from './dto/run-payroll.dto';
import { PayRunWorkflowService } from './pay-run-workflow.service';
import { CreatePayrollAdjustmentDto, UpdatePayrollAdjustmentDto } from './dto/payroll-adjustment.dto';

@Controller('payroll')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
@RequiresModule('Payroll')
export class PayrollController {
  constructor(
    private payroll: PayrollService,
    private workflow: PayRunWorkflowService,
  ) {}

  @Get('runs')
  @Roles('ADMIN', 'HR')
  listRuns(@CurrentUser() user: AuthenticatedUser) {
    return this.payroll.listRuns(user.tenantId);
  }

  @Post('runs')
  @Roles('ADMIN', 'HR')
  runPayroll(@CurrentUser() user: AuthenticatedUser, @Body() dto: RunPayrollDto) {
    return this.payroll.runPayroll(user.tenantId, user, dto);
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

  // --- v030.A: stages and approvals -------------------------------------
  // Approvers need no HR/Admin role, so these routes admit every signed-in
  // role and the workflow service decides who may do what.

  @Get('runs/:id')
  @Roles('ADMIN', 'HR', 'SUPERVISOR', 'EMPLOYEE')
  runDetail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.workflow.detail(user.tenantId, user, id);
  }

  @Get('runs/:id/payslips/all')
  @Roles('ADMIN', 'HR', 'SUPERVISOR', 'EMPLOYEE')
  async runPayslipsForReview(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.workflow.detail(user.tenantId, user, id); // access check
    return this.payroll.listPayslips(user.tenantId, id);
  }

  @Post('runs/:id/recalculate')
  @Roles('ADMIN', 'HR')
  recalculate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.payroll.recalculate(user.tenantId, user, id);
  }

  @Post('runs/:id/submit')
  @Roles('ADMIN', 'HR')
  submit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: PayRunActionDto) {
    return this.workflow.submit(user.tenantId, user, id, dto.comment, dto.acknowledgeChecks);
  }

  @Post('runs/:id/withdraw')
  @Roles('ADMIN', 'HR')
  withdraw(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: PayRunActionDto) {
    return this.workflow.withdraw(user.tenantId, user, id, dto.comment);
  }

  @Post('runs/:id/approve')
  @Roles('ADMIN', 'HR', 'SUPERVISOR', 'EMPLOYEE')
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: PayRunActionDto) {
    return this.workflow.approve(user.tenantId, user, id, dto.comment);
  }

  @Post('runs/:id/send-back')
  @Roles('ADMIN', 'HR', 'SUPERVISOR', 'EMPLOYEE')
  sendBack(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: PayRunActionDto) {
    return this.workflow.sendBack(user.tenantId, user, id, dto.comment);
  }

  @Post('runs/:id/reopen')
  @Roles('ADMIN', 'HR', 'SUPERVISOR', 'EMPLOYEE')
  reopen(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: PayRunActionDto) {
    return this.workflow.reopen(user.tenantId, user, id, dto.comment);
  }

  @Post('runs/:id/mark-paid')
  @Roles('ADMIN', 'HR')
  markPaid(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.workflow.markPaid(user.tenantId, user, id);
  }

  @Get('approvals/mine')
  @Roles('ADMIN', 'HR', 'SUPERVISOR', 'EMPLOYEE')
  myApprovals(@CurrentUser() user: AuthenticatedUser) {
    return this.workflow.myApprovals(user.tenantId, user);
  }

  @Get('approval-settings/:country')
  @Roles('ADMIN', 'HR')
  approvalSettings(@CurrentUser() user: AuthenticatedUser, @Param('country') country: string) {
    return this.workflow.getSettings(user.tenantId, country.toUpperCase());
  }

  @Patch('approval-settings/:country')
  @Roles('ADMIN')
  saveApprovalSettings(@CurrentUser() user: AuthenticatedUser, @Param('country') country: string, @Body() dto: ApprovalSettingsDto) {
    return this.workflow.saveSettings(user.tenantId, country.toUpperCase(), dto);
  }

  @Patch('approvers/employee/:employeeId')
  @Roles('ADMIN')
  setCanApprove(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string, @Body() dto: CanApproveDto) {
    return this.workflow.setCanApprove(user.tenantId, employeeId, dto.canApprovePayroll, user);
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
