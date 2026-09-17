import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { DOCUMENT_MIME_TYPES, assertMimeType } from '../../common/uploads/file.util';
import { EmployeesService } from './employees.service';
import { EmployeeDocumentsService } from './employee-documents.service';
import { UpdateDocumentDto, UploadDocumentDto } from './dto/employee-documents.dto';

/** Documents tab on the People profile (and the self-service "My Documents"
 *  page, which points at the signed-in user's own employeeId). Read follows
 *  the usual profile visibility rule. Unlike most People-profile writes,
 *  upload/delete here isn't Admin-only — Official ID and similar documents
 *  are normally self-uploaded — so it's allowed for Admin OR the employee
 *  managing their own documents. */
@Controller('employees/:employeeId/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPERVISOR', 'EMPLOYEE', 'HR')
export class EmployeeDocumentsController {
  constructor(
    private employees: EmployeesService,
    private documents: EmployeeDocumentsService,
  ) {}

  private assertCanEdit(user: AuthenticatedUser, employeeId: string) {
    if (user.role === 'ADMIN' || user.role === 'HR' || user.employeeId === employeeId) return;
    throw new ForbiddenException('You can only manage your own documents.');
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string) {
    await this.employees.assertVisible(user.tenantId, user, employeeId);
    return this.documents.list(user.tenantId, employeeId);
  }

  @Get(':id')
  async get(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string, @Param('id') id: string) {
    await this.employees.assertVisible(user.tenantId, user, employeeId);
    return this.documents.get(user.tenantId, employeeId, id);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  add(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    this.assertCanEdit(user, employeeId);
    assertMimeType(file, DOCUMENT_MIME_TYPES, 'document');
    return this.documents.add(user.tenantId, employeeId, user.employeeId ?? null, dto, file);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    this.assertCanEdit(user, employeeId);
    return this.documents.update(user.tenantId, employeeId, id, dto);
  }

  @Delete(':id')
  delete(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string, @Param('id') id: string) {
    this.assertCanEdit(user, employeeId);
    return this.documents.delete(user.tenantId, employeeId, id);
  }
}
