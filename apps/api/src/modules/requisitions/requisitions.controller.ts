import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ModuleGuard } from '../../common/guards/module.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequiresModule } from '../../common/decorators/requires-module.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequisitionsService } from './requisitions.service';
import { CreateRequisitionDto, UpdateRequisitionDto, ApplyDto } from './dto/requisition.dto';

// Every route below except `apply` is internal (Admin/Supervisor), gated
// behind the Recruitment module. `apply` stays reachable even for a tenant
// without Recruitment — CareersModule's public listing is separately
// ungated, and gating apply too would just 403 a candidate mid-application
// for something outside their control. Disabling Recruitment stops new
// requisitions from being raised/approved, which naturally stops new
// postings from appearing, without needing to also block this endpoint.
@Controller('requisitions')
export class RequisitionsController {
  constructor(private requisitions: RequisitionsService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
  @Roles('ADMIN', 'SUPERVISOR', 'HR')
  @RequiresModule('Recruitment')
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.requisitions.findAll(user.tenantId);
  }

  // An Admin account created via the platform-admin "Add Tenant" flow has
  // no linked employees row (see users.employeeId in schema.ts), so this no
  // longer requires one — requestedById is nullable and RequisitionsService
  // falls back to notifying every Admin/HR login when it's null.
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
  @Roles('SUPERVISOR', 'ADMIN', 'HR')
  @RequiresModule('Recruitment')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRequisitionDto) {
    return this.requisitions.create(user.tenantId, user.employeeId ?? null, dto);
  }

  @Post(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
  @Roles('ADMIN', 'HR')
  @RequiresModule('Recruitment')
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.requisitions.approve(user.tenantId, id, user.employeeId ?? null);
  }

  /** Edits a requisition, including the public careers-page content (role summary, what you'll do/bring/get, why us). */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
  @Roles('SUPERVISOR', 'ADMIN', 'HR')
  @RequiresModule('Recruitment')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateRequisitionDto) {
    return this.requisitions.update(user.tenantId, id, dto);
  }

  // Application Review (candidate ranking + document viewing) is scoped
  // narrower than the rest of Recruitment — ADMIN/HR only, not Supervisor —
  // per how the feature was specced.
  @Get(':id/candidates')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
  @Roles('ADMIN', 'HR')
  @RequiresModule('Recruitment')
  candidates(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.requisitions.listCandidates(user.tenantId, id);
  }

  /** "View" on a candidate's CV or cover letter in Application Review — same
   *  DocumentFull shape (label/mimeType/dataUrl) the People profile's
   *  Documents tab uses, so the frontend reuses the same viewer modal.
   *  ?kind=resume (default) or coverLetter. */
  @Get(':id/candidates/:candidateId/document')
  @UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
  @Roles('ADMIN', 'HR')
  @RequiresModule('Recruitment')
  candidateDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('candidateId') candidateId: string,
    @Query('kind') kind: string,
  ) {
    if (kind !== 'resume' && kind !== 'coverLetter') {
      throw new BadRequestException('kind must be "resume" or "coverLetter".');
    }
    return this.requisitions.getCandidateDocument(user.tenantId, id, candidateId, kind);
  }

  /** Public — a job candidate applying has no account yet. Tenant comes from
   *  the career-site header. Multipart: `cv` (required) and `coverLetter`
   *  (optional) files, 2MB cap each, plus every other ApplyDto field as
   *  form text (see ApplyDto's doc comment for why the repeatable sections
   *  travel as JSON strings). */
  @Post(':id/apply')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'cv', maxCount: 1 },
        { name: 'coverLetter', maxCount: 1 },
      ],
      { limits: { fileSize: 2 * 1024 * 1024 } },
    ),
  )
  apply(
    @Headers('x-tenant-slug') tenantSlug: string,
    @Param('id') id: string,
    @Body() dto: ApplyDto,
    @UploadedFiles() files: { cv?: Express.Multer.File[]; coverLetter?: Express.Multer.File[] },
  ) {
    const cv = files?.cv?.[0];
    if (!cv) throw new BadRequestException('A CV upload is required.');
    return this.requisitions.apply(tenantSlug, id, dto, cv, files?.coverLetter?.[0]);
  }
}
