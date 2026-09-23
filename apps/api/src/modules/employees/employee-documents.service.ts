import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, or } from 'drizzle-orm';
import { withTenant } from '../../db/client';
import { employeeDocuments, employees, users } from '../../db/schema';
import { toDataUri } from '../../common/uploads/file.util';
import { MailService } from '../../common/mail/mail.service';
import { categoryForDocumentType, type UpdateDocumentDto, type UploadDocumentDto } from './dto/employee-documents.dto';

/** Documents module — one Add Document row per upload, each carrying a
 *  Document Type (DOCUMENT_TYPES) and a name given by the uploader.
 *  `category` (CONTRACT/ID/OTHER) still lives on the row — derived from
 *  Document Type at insert time via `categoryForDocumentType` — since the
 *  Admin/HR tenant-wide Documents browser still groups by it and the
 *  "documents missing" reports still filter by it. The column storing
 *  Document Type is still named `tag` in Postgres (it predates this
 *  redesign, back when only OTHER-category uploads carried one) — aliased
 *  to `documentType` in every select below so nothing above this file needs
 *  to know that. `list` deliberately omits `dataUrl` (could be several MB
 *  per row) — the frontend fetches the full document, data URI included,
 *  only when the user opens it. */
@Injectable()
export class EmployeeDocumentsService {
  constructor(private mail: MailService) {}

  list(tenantId: string, employeeId: string) {
    return withTenant(tenantId, (tx) =>
      tx
        .select({
          id: employeeDocuments.id,
          category: employeeDocuments.category,
          label: employeeDocuments.label,
          documentType: employeeDocuments.tag,
          fileName: employeeDocuments.fileName,
          mimeType: employeeDocuments.mimeType,
          uploadedById: employeeDocuments.uploadedById,
          createdAt: employeeDocuments.createdAt,
        })
        .from(employeeDocuments)
        .where(and(eq(employeeDocuments.tenantId, tenantId), eq(employeeDocuments.employeeId, employeeId)))
        .orderBy(desc(employeeDocuments.createdAt)),
    );
  }

  /** Tenant-wide listing for the Documents sidebar's Admin view — every
   *  document across every employee, joined with just enough of the owning
   *  employee's profile (name, designation, login email) for the "grouped by
   *  Contracts/Official ID/Other, expand to see who" list. Left-joins `users`
   *  since an employee doesn't always have a login account yet. Omits
   *  `dataUrl` for the same reason `list` does — the page fetches the full
   *  document (via the existing per-employee `get` above) only on View. */
  listForTenant(tenantId: string) {
    return withTenant(tenantId, (tx) =>
      tx
        .select({
          id: employeeDocuments.id,
          category: employeeDocuments.category,
          label: employeeDocuments.label,
          documentType: employeeDocuments.tag,
          fileName: employeeDocuments.fileName,
          mimeType: employeeDocuments.mimeType,
          createdAt: employeeDocuments.createdAt,
          employeeId: employeeDocuments.employeeId,
          firstName: employees.firstName,
          lastName: employees.lastName,
          jobTitle: employees.jobTitle,
          email: users.email,
        })
        .from(employeeDocuments)
        .innerJoin(employees, eq(employees.id, employeeDocuments.employeeId))
        .leftJoin(users, eq(users.employeeId, employees.id))
        .where(eq(employeeDocuments.tenantId, tenantId))
        .orderBy(desc(employeeDocuments.createdAt)),
    );
  }

  async get(tenantId: string, employeeId: string, id: string) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(employeeDocuments)
        .where(
          and(eq(employeeDocuments.tenantId, tenantId), eq(employeeDocuments.employeeId, employeeId), eq(employeeDocuments.id, id)),
        )
        .limit(1),
    );
    if (!row) throw new NotFoundException('Document not found.');
    return row;
  }

  async add(tenantId: string, employeeId: string, uploadedById: string | null, dto: UploadDocumentDto, file: Express.Multer.File) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .insert(employeeDocuments)
        .values({
          tenantId,
          employeeId,
          category: categoryForDocumentType(dto.documentType),
          label: dto.label,
          tag: dto.documentType,
          fileName: file.originalname,
          mimeType: file.mimetype,
          dataUrl: toDataUri(file),
          uploadedById: uploadedById ?? undefined,
        })
        .returning({
          id: employeeDocuments.id,
          category: employeeDocuments.category,
          label: employeeDocuments.label,
          documentType: employeeDocuments.tag,
          fileName: employeeDocuments.fileName,
          mimeType: employeeDocuments.mimeType,
          uploadedById: employeeDocuments.uploadedById,
          createdAt: employeeDocuments.createdAt,
        }),
    );
    return row;
  }

  /** Fire-and-forget notification for a newly added document. Keyed on
   *  identity, not role: when the uploader IS the document's owner (a
   *  self-upload, whoever's account it is), every Admin/HR login on the
   *  tenant is told to go review it; when someone else added it on the
   *  employee's behalf (the normal Admin/HR path), the employee is told at
   *  their personal email instead. Never emails the actor about their own
   *  action. */
  async notifyDocumentAdded(tenantId: string, employeeId: string, label: string, addedByEmployeeId: string | null) {
    const [employee] = await withTenant(tenantId, (tx) =>
      tx
        .select({ firstName: employees.firstName, lastName: employees.lastName, email: employees.email })
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId)))
        .limit(1),
    );
    if (!employee) return;
    const name = `${employee.firstName} ${employee.lastName}`;

    if (addedByEmployeeId === employeeId) {
      const admins = await withTenant(tenantId, (tx) =>
        tx
          .select({ email: users.email })
          .from(users)
          .where(and(eq(users.tenantId, tenantId), or(eq(users.role, 'ADMIN'), eq(users.role, 'HR')))),
      );
      await Promise.all(
        admins
          .filter((a) => a.email)
          .map((a) =>
            this.mail.send({
              to: a.email,
              subject: `New document uploaded — ${name}`,
              text: `${name} uploaded a new document ("${label}") to their file.\n\nSign in to tmPro to review it under Documents.`,
            }),
          ),
      );
    } else if (employee.email) {
      await this.mail.send({
        to: employee.email,
        subject: 'A new document was added to your file',
        text: `"${label}" was added to your file in tmPro.\n\nSign in to tmPro to view it under Documents.`,
      });
    }
  }

  async update(tenantId: string, employeeId: string, id: string, dto: UpdateDocumentDto) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .update(employeeDocuments)
        .set({
          label: dto.label,
          // documentType is optional on an edit (a pre-redesign document
          // with no type yet can still just be renamed) — only touch
          // category/tag when a type was actually picked.
          ...(dto.documentType ? { category: categoryForDocumentType(dto.documentType), tag: dto.documentType } : {}),
        })
        .where(
          and(eq(employeeDocuments.tenantId, tenantId), eq(employeeDocuments.employeeId, employeeId), eq(employeeDocuments.id, id)),
        )
        .returning({
          id: employeeDocuments.id,
          category: employeeDocuments.category,
          label: employeeDocuments.label,
          documentType: employeeDocuments.tag,
          fileName: employeeDocuments.fileName,
          mimeType: employeeDocuments.mimeType,
          uploadedById: employeeDocuments.uploadedById,
          createdAt: employeeDocuments.createdAt,
        }),
    );
    if (!row) throw new NotFoundException('Document not found.');
    return row;
  }

  async delete(tenantId: string, employeeId: string, id: string) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .delete(employeeDocuments)
        .where(
          and(eq(employeeDocuments.tenantId, tenantId), eq(employeeDocuments.employeeId, employeeId), eq(employeeDocuments.id, id)),
        )
        .returning({ id: employeeDocuments.id }),
    );
    if (!row) throw new NotFoundException('Document not found.');
    return row;
  }
}
