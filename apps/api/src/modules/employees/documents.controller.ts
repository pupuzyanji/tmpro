import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { EmployeeDocumentsService } from './employee-documents.service';

/** Documents sidebar's Admin/HR view — every document belonging to every
 *  employee in the tenant, grouped client-side by category (Contract
 *  Documents / Official ID / Other Files). Distinct from
 *  EmployeeDocumentsController, which is scoped to one employee at a time
 *  (and also backs the self-service "My Documents" page); this is
 *  deliberately Admin/HR-only since it surfaces everyone's documents at
 *  once. Viewing a document still goes through the per-employee `GET
 *  /employees/:employeeId/documents/:id` endpoint (same visibility rule
 *  Admin/HR already have there), so there's no second "fetch the file"
 *  route to keep in sync. */
@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'HR')
export class DocumentsController {
  constructor(private documents: EmployeeDocumentsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.documents.listForTenant(user.tenantId);
  }
}
