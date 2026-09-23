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
 *  the usual profile visibility rule. Uploading isn't Admin-only — Official
 *  ID and similar documents are normally self-uploaded — so it's allowed
 *  for Admin/HR OR the employee adding to their own documents. Editing
 *  (rename/re-tag) and deleting are narrower: Admin/HR only, even on your
 *  own documents — an employee who uploads the wrong file has to ask an
 *  Admin/HR to fix or remove it rather than doing it themselves. */
@Controller('employees/:employeeId/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPERVISOR', 'EMPLOYEE', 'HR')
export class EmployeeDocumentsController {
  constructor(
    private employees: EmployeesService,
    private documents: EmployeeDocumentsService,
  ) {}

  private assertCanAdd(user: AuthenticatedUser, employeeId: string) {
    if (user.role === 'ADMIN' || user.role === 'HR' || user.employeeId === employeeId) return;
    throw new ForbiddenException('You can only upload to your own documents.');
  }

  private assertCanManage(user: AuthenticatedUser) {
    if (user.role === 'ADMIN' || user.role === 'HR') return;
    throw new ForbiddenException('Only an Admin or HR can edit or delete a document.');
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

  // Documents tab's Add Document row — 2MB per file, enforced here as well
  // as client-side (the client check is what most people see; this is the
  // backstop against a direct API call).
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    this.assertCanAdd(user, employeeId);
    assertMimeType(file, DOCUMENT_MIME_TYPES, 'document');
    const row = await this.documents.add(user.tenantId, employeeId, user.employeeId ?? null, dto, file);
    await this.documents.notifyDocumentAdded(user.tenantId, employeeId, row.label, user.employeeId ?? null);
    return row;
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    this.assertCanManage(user);
    return this.documents.update(user.tenantId, employeeId, id, dto);
  }

  @Delete(':id')
  delete(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string, @Param('id') id: string) {
    this.assertCanManage(user);
    return this.documents.delete(user.tenantId, employeeId, id);
  }
}
