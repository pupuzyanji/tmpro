import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import { SettingsService } from './settings.service';
import {
  BulkUpdateLeaveTypesDto,
  CreateAnnouncementDto,
  CreateBranchDto,
  CreateDepartmentDto,
  CreateDesignationDto,
  CreateSectionDto,
  UpdateAnnouncementDto,
  UpdateBranchDto,
  UpdateDepartmentDto,
  UpdateDesignationDto,
  UpdateOrganizationDto,
  UpdateSectionDto,
} from './dto/settings.dto';

/** The Settings module backs the Settings sidebar: Organization, Branches,
 *  Departments (+ Sections), Designations, Leave, Announcements. Employees
 *  is deliberately not here — employee CRUD stays on `/employees`, since
 *  that's also what the People module reads; Settings → Employees in the
 *  frontend is a configuration view over that same endpoint. Org Chart has
 *  no endpoints of its own — it's a derived view over `/employees` and
 *  `/settings/designations`.
 *
 *  v019.A (follow-up): no more class-level guard. Organization, Branches,
 *  Departments/Sections, and Designations — the org-structure config the
 *  user called out by name — stay Admin-only. Everything else here (Leave
 *  types, Announcements) is Admin or HR, per "HR ... has the rest." */
@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private settings: SettingsService) {}

  // --- Organization (Admin-only) ------------------------------------------

  @Get('organization')
  @Roles('ADMIN')
  getOrganization(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.getOrganization(user.tenantId);
  }

  @Patch('organization')
  @Roles('ADMIN')
  updateOrganization(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateOrganizationDto) {
    return this.settings.updateOrganization(user.tenantId, dto);
  }

  @Post('organization/logo')
  @Roles('ADMIN')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 3 * 1024 * 1024 } }))
  uploadLogo(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: Express.Multer.File) {
    assertMimeType(file, IMAGE_MIME_TYPES, 'logo');
    return this.settings.updateOrganization(user.tenantId, { logoUrl: toDataUri(file) });
  }

  // --- Branches (Admin-only) -----------------------------------------------

  @Get('branches')
  @Roles('ADMIN')
  listBranches(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.listBranches(user.tenantId);
  }

  @Post('branches')
  @Roles('ADMIN')
  createBranch(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBranchDto) {
    return this.settings.createBranch(user.tenantId, dto);
  }

  @Patch('branches/:id')
  @Roles('ADMIN')
  updateBranch(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.settings.updateBranch(user.tenantId, id, dto);
  }

  @Delete('branches/:id')
  @Roles('ADMIN')
  deleteBranch(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.settings.deleteBranch(user.tenantId, id);
  }

  @Post('branches/import')
  @Roles('ADMIN')
  @UseInterceptors(FileInterceptor('file'))
  importBranches(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: Express.Multer.File) {
    return this.settings.importBranches(user.tenantId, file.buffer);
  }

  // --- Departments (Admin-only) -------------------------------------------

  @Get('departments')
  @Roles('ADMIN')
  listDepartments(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.listDepartments(user.tenantId);
  }

  @Post('departments')
  @Roles('ADMIN')
  createDepartment(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDepartmentDto) {
    return this.settings.createDepartment(user.tenantId, dto);
  }

  @Patch('departments/:id')
  @Roles('ADMIN')
  updateDepartment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.settings.updateDepartment(user.tenantId, id, dto);
  }

  @Delete('departments/:id')
  @Roles('ADMIN')
  deleteDepartment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.settings.deleteDepartment(user.tenantId, id);
  }

  @Post('departments/import')
  @Roles('ADMIN')
  @UseInterceptors(FileInterceptor('file'))
  importDepartments(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: Express.Multer.File) {
    return this.settings.importDepartments(user.tenantId, file.buffer);
  }

  // --- Sections (nested under a Department — Admin-only, same as Departments) ---

  @Get('sections')
  @Roles('ADMIN')
  listSections(@CurrentUser() user: AuthenticatedUser, @Query('departmentId') departmentId?: string) {
    return this.settings.listSections(user.tenantId, departmentId);
  }

  @Post('sections')
  @Roles('ADMIN')
  createSection(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSectionDto) {
    return this.settings.createSection(user.tenantId, dto);
  }

  @Patch('sections/:id')
  @Roles('ADMIN')
  updateSection(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateSectionDto) {
    return this.settings.updateSection(user.tenantId, id, dto);
  }

  @Delete('sections/:id')
  @Roles('ADMIN')
  deleteSection(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.settings.deleteSection(user.tenantId, id);
  }

  @Post('sections/import')
  @Roles('ADMIN')
  @UseInterceptors(FileInterceptor('file'))
  importSections(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: Express.Multer.File) {
    return this.settings.importSections(user.tenantId, file.buffer);
  }

  // --- Designations (list is Admin/HR/Supervisor — the Recruitment "Role
  // title" dropdown reads this list; everything else stays Admin-only) -----

  @Get('designations')
  @Roles('ADMIN', 'HR', 'SUPERVISOR')
  listDesignations(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.listDesignations(user.tenantId);
  }

  @Post('designations')
  @Roles('ADMIN')
  createDesignation(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDesignationDto) {
    return this.settings.createDesignation(user.tenantId, dto);
  }

  @Patch('designations/:id')
  @Roles('ADMIN')
  updateDesignation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateDesignationDto,
  ) {
    return this.settings.updateDesignation(user.tenantId, id, dto);
  }

  @Delete('designations/:id')
  @Roles('ADMIN')
  deleteDesignation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.settings.deleteDesignation(user.tenantId, id);
  }

  @Post('designations/import')
  @Roles('ADMIN')
  @UseInterceptors(FileInterceptor('file'))
  importDesignations(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: Express.Multer.File) {
    return this.settings.importDesignations(user.tenantId, file.buffer);
  }

  // --- Leave (per-country-regime leave-type catalog) — Admin or HR --------

  @Get('leave-types')
  @Roles('ADMIN', 'HR')
  listLeaveTypes(@CurrentUser() user: AuthenticatedUser, @Query('countryCode') countryCode: string) {
    return this.settings.listLeaveTypes(user.tenantId, countryCode || 'ZM');
  }

  @Patch('leave-types')
  @Roles('ADMIN', 'HR')
  bulkUpdateLeaveTypes(@CurrentUser() user: AuthenticatedUser, @Body() dto: BulkUpdateLeaveTypesDto) {
    return this.settings.bulkUpdateLeaveTypes(user.tenantId, dto);
  }

  // --- Announcements (Admin or HR) ----------------------------------------
  // Sending is Admin/HR, but every signed-in role can read the list back —
  // Announcements are meant to show on "all related dashboards", so the
  // Dashboard page needs a non-Admin read. That read lives on a separate
  // route below (AnnouncementsFeedController).

  @Get('announcements')
  @Roles('ADMIN', 'HR')
  listAnnouncements(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.listAnnouncements(user.tenantId);
  }

  @Post('announcements')
  @Roles('ADMIN', 'HR')
  createAnnouncement(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAnnouncementDto) {
    return this.settings.createAnnouncement(user.tenantId, user.employeeId, dto);
  }

  @Patch('announcements/:id')
  @Roles('ADMIN', 'HR')
  updateAnnouncement(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateAnnouncementDto) {
    return this.settings.updateAnnouncement(user.tenantId, id, dto);
  }

  @Delete('announcements/:id')
  @Roles('ADMIN', 'HR')
  deleteAnnouncement(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.settings.deleteAnnouncement(user.tenantId, id);
  }
}

/** Read-only announcements feed for the signed-in user's own dashboard —
 *  open to every role, unlike the Admin-only management endpoints above. */
@Controller('announcements')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPERVISOR', 'EMPLOYEE', 'HR')
export class AnnouncementsFeedController {
  constructor(private settings: SettingsService) {}

  @Get('me')
  async mine(@CurrentUser() user: AuthenticatedUser) {
    if (!user.employeeId) {
      const all = await this.settings.listAnnouncements(user.tenantId);
      return all.filter((x) => x.scope === 'ORGANIZATION').map((a) => ({ ...a, read: true }));
    }
    return this.settings.announcementsForEmployee(user.tenantId, user.employeeId);
  }

  @Post(':id/read')
  async markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    if (!user.employeeId) return { id, read: true };
    return this.settings.markAnnouncementRead(user.tenantId, user.employeeId, id);
  }
}

/** Org branding (name + logo) for the app shell header — open to every
 *  signed-in role, unlike the Admin-only Settings → Organization management
 *  routes above (the header shows this for everyone, not just Admins). */
@Controller('settings/organization-branding')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPERVISOR', 'EMPLOYEE', 'CANDIDATE', 'HR')
export class OrganizationBrandingController {
  constructor(private settings: SettingsService) {}

  @Get()
  async branding(@CurrentUser() user: AuthenticatedUser) {
    const org = await this.settings.getOrganization(user.tenantId);
    // currency travels with branding (not the Admin-only /settings/organization
    // route) because every role needs it for money formatting — payslips,
    // pay-run totals — not just Admins.
    return { name: org.name, logoUrl: org.logoUrl, currency: org.currency };
  }
}
