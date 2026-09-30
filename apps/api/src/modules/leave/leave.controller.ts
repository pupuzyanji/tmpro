import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { and, eq } from 'drizzle-orm';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ModuleGuard } from '../../common/guards/module.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequiresModule } from '../../common/decorators/requires-module.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { DOCUMENT_MIME_TYPES } from '../../common/uploads/file.util';
import { withTenant } from '../../db/client';
import { employees } from '../../db/schema';
import { ADJUSTMENT_REASONS, LeaveService, RequestPayload } from './leave.service';

const TWO_MB = 2 * 1024 * 1024;

function bool(v: unknown): boolean {
  return v === true || v === 'true' || v === '1' || v === 'on';
}

/** Leave requests arrive as multipart (optional supporting document), so
 *  fields are strings — normalise them here. */
function payload(body: Record<string, any>): RequestPayload {
  if (!body.leaveTypeId) throw new BadRequestException('Choose a leave type.');
  return {
    leaveTypeId: String(body.leaveTypeId),
    startDate: String(body.startDate ?? ''),
    endDate: String(body.endDate ?? body.startDate ?? ''),
    startHalf: bool(body.startHalf),
    endHalf: bool(body.endHalf),
    eventDate: body.eventDate ? String(body.eventDate) : null,
    multipleBirth: bool(body.multipleBirth),
    reason: body.reason != null ? String(body.reason) : null,
    employeeId: body.employeeId ? String(body.employeeId) : null,
    autoApprove: bool(body.autoApprove),
  };
}

@Controller('leave')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
@RequiresModule('Leave & Attendance')
export class LeaveController {
  constructor(private leave: LeaveService) {}

  /** Admin/HR see anyone; a supervisor sees their direct reports; everyone sees themselves. */
  private async assertCanView(user: AuthenticatedUser, employeeId: string) {
    if (user.role === 'ADMIN' || user.role === 'HR' || user.employeeId === employeeId) return;
    if (user.role === 'SUPERVISOR' && user.employeeId) {
      const [e] = await withTenant(user.tenantId, (tx) =>
        tx.select({ managerId: employees.managerId }).from(employees).where(and(eq(employees.tenantId, user.tenantId), eq(employees.id, employeeId))).limit(1),
      );
      if (e?.managerId === user.employeeId) return;
    }
    throw new ForbiddenException('You can only view leave for yourself or your team.');
  }

  // ---------------------------------------------------------------- self-service

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    if (!user.employeeId) return { employee: null, types: [] };
    return this.leave.overview(user.tenantId, user.employeeId);
  }

  @Get('requests/me')
  myRequests(@CurrentUser() user: AuthenticatedUser) {
    if (!user.employeeId) return [];
    return this.leave.requestsFor(user.tenantId, user.employeeId);
  }

  @Get('ledger/me')
  myLedger(@CurrentUser() user: AuthenticatedUser) {
    if (!user.employeeId) return [];
    return this.leave.ledgerFor(user.tenantId, user.employeeId);
  }

  @Post('requests/preview')
  preview(@CurrentUser() user: AuthenticatedUser, @Body() body: Record<string, any>) {
    return this.leave.preview(user, payload(body));
  }

  @Post('requests')
  @UseInterceptors(FileInterceptor('attachment', { limits: { fileSize: TWO_MB } }))
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: Record<string, any>, @UploadedFile() file?: Express.Multer.File) {
    if (file && !DOCUMENT_MIME_TYPES.includes(file.mimetype)) throw new BadRequestException('Attach a PDF or an image.');
    return this.leave.create(user, payload(body), file);
  }

  @Post('requests/:id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.leave.cancel(user, id, body?.reason);
  }

  // ---------------------------------------------------------------- approvals

  @Get('approvals')
  @Roles('SUPERVISOR', 'ADMIN', 'HR')
  approvals(@CurrentUser() user: AuthenticatedUser) {
    return this.leave.approvals(user);
  }

  @Post('requests/:id/approve')
  @Roles('SUPERVISOR', 'ADMIN', 'HR')
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: { comment?: string }) {
    return this.leave.decide(user, id, 'APPROVED', body?.comment);
  }

  @Post('requests/:id/decline')
  @Roles('SUPERVISOR', 'ADMIN', 'HR')
  decline(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: { comment?: string }) {
    return this.leave.decide(user, id, 'DECLINED', body?.comment);
  }

  // ---------------------------------------------------------------- one employee (People → Leave tab)

  @Get('employees/:id')
  async employeeOverview(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.assertCanView(user, id);
    return this.leave.overview(user.tenantId, id);
  }

  @Get('employees/:id/requests')
  async employeeRequests(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.assertCanView(user, id);
    return this.leave.requestsFor(user.tenantId, id);
  }

  @Get('employees/:id/ledger')
  async employeeLedger(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.assertCanView(user, id);
    return this.leave.ledgerFor(user.tenantId, id);
  }

  @Post('employees/:id/adjustments')
  @Roles('ADMIN', 'HR')
  adjust(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: any) {
    return this.leave.adjust(user, id, body);
  }

  @Patch('employees/:id/profile')
  @Roles('ADMIN', 'HR')
  profile(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: any) {
    return this.leave.updateProfile(user.tenantId, id, body ?? {});
  }

  @Post('ledger/:entryId/reverse')
  @Roles('ADMIN', 'HR')
  reverse(@CurrentUser() user: AuthenticatedUser, @Param('entryId') entryId: string, @Body() body: { note?: string }) {
    return this.leave.reverseEntry(user, entryId, body?.note);
  }

  @Get('adjustment-reasons')
  reasons() {
    return ADJUSTMENT_REASONS;
  }

  // Back-compat for the Reports page and older clients.
  @Get('requests/employee/:id')
  async legacyEmployeeRequests(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.assertCanView(user, id);
    return this.leave.requestsFor(user.tenantId, id);
  }

  // ---------------------------------------------------------------- Settings → Leave (Admin/HR)

  @Get('admin/policies')
  @Roles('ADMIN', 'HR')
  policies(@CurrentUser() user: AuthenticatedUser, @Query('country') country = 'ZM') {
    return this.leave.adminPolicies(user.tenantId, country);
  }

  @Put('admin/policies/:leaveTypeId')
  @Roles('ADMIN', 'HR')
  updatePolicy(@CurrentUser() user: AuthenticatedUser, @Param('leaveTypeId') id: string, @Body() body: any) {
    return this.leave.updatePolicy(user, id, body ?? {});
  }

  @Post('admin/types')
  @Roles('ADMIN', 'HR')
  addType(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.leave.addCustomType(user, body ?? {});
  }

  @Delete('admin/types/:id')
  @Roles('ADMIN', 'HR')
  retireType(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.leave.retireType(user.tenantId, id);
  }

  @Get('admin/holidays')
  @Roles('ADMIN', 'HR')
  holidays(@CurrentUser() user: AuthenticatedUser, @Query('country') country = 'ZM', @Query('year') year?: string) {
    return this.leave.holidays(user.tenantId, country, Number(year) || new Date().getUTCFullYear());
  }

  @Post('admin/holidays')
  @Roles('ADMIN', 'HR')
  addHoliday(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.leave.addHoliday(user.tenantId, body ?? {});
  }

  @Delete('admin/holidays/:id')
  @Roles('ADMIN', 'HR')
  removeHoliday(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.leave.removeHoliday(user.tenantId, id);
  }

  @Get('admin/schedules')
  @Roles('ADMIN', 'HR')
  schedules(@CurrentUser() user: AuthenticatedUser) {
    return this.leave.schedules(user.tenantId);
  }

  @Post('admin/schedules')
  @Roles('ADMIN', 'HR')
  saveSchedule(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.leave.saveSchedule(user.tenantId, body ?? {});
  }

  @Get('admin/settings')
  @Roles('ADMIN', 'HR')
  settings(@CurrentUser() user: AuthenticatedUser) {
    return this.leave.settings(user.tenantId);
  }

  @Patch('admin/settings')
  @Roles('ADMIN', 'HR')
  saveSettings(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.leave.saveSettings(user.tenantId, body ?? {});
  }

  @Post('admin/process')
  @Roles('ADMIN', 'HR')
  async process(@CurrentUser() user: AuthenticatedUser) {
    const employeesProcessed = await this.leave.processTenant(user.tenantId);
    return { ok: true, employeesProcessed };
  }

  @Get('admin/opening/template')
  @Roles('ADMIN', 'HR')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  openingTemplate(@CurrentUser() user: AuthenticatedUser, @Query('country') country = 'ZM') {
    return this.leave.openingTemplate(user.tenantId, country);
  }

  @Post('admin/opening/batches')
  @Roles('ADMIN', 'HR')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: TWO_MB } }))
  openingUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { country?: string; cutoverDate?: string },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.leave.openingUpload(user, body.country || 'ZM', body.cutoverDate ?? '', file);
  }

  @Get('admin/opening/batches')
  @Roles('ADMIN', 'HR')
  openingBatches(@CurrentUser() user: AuthenticatedUser) {
    return this.leave.openingBatches(user.tenantId);
  }

  @Get('admin/opening/batches/:id')
  @Roles('ADMIN', 'HR')
  openingBatch(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.leave.openingBatch(user.tenantId, id);
  }

  @Post('admin/opening/batches/:id/post')
  @Roles('ADMIN', 'HR')
  openingPost(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.leave.openingPost(user, id);
  }

  @Post('admin/opening/batches/:id/reverse')
  @Roles('ADMIN', 'HR')
  openingReverse(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.leave.openingReverse(user, id);
  }

  @Delete('admin/opening/batches/:id')
  @Roles('ADMIN', 'HR')
  openingDelete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.leave.openingDelete(user.tenantId, id);
  }

  @Get('admin/overdue')
  @Roles('ADMIN', 'HR')
  overdue(@CurrentUser() user: AuthenticatedUser) {
    return this.leave.overdueReport(user.tenantId);
  }

  @Get('admin/liability')
  @Roles('ADMIN', 'HR')
  liability(@CurrentUser() user: AuthenticatedUser) {
    return this.leave.liability(user.tenantId);
  }
}
