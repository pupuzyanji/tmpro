import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { withTenant } from '../../db/client';
import { employeeDocuments } from '../../db/schema';
import { toDataUri } from '../../common/uploads/file.util';
import type { UpdateDocumentDto, UploadDocumentDto } from './dto/employee-documents.dto';

/** Documents module: Contract Documents, Official ID, and Other Files —
 *  each named by the uploader at upload time. `list` deliberately omits
 *  `dataUrl` (could be several MB per row) — the frontend fetches the full
 *  document, data URI included, only when the user opens it. */
@Injectable()
export class EmployeeDocumentsService {
  list(tenantId: string, employeeId: string) {
    return withTenant(tenantId, (tx) =>
      tx
        .select({
          id: employeeDocuments.id,
          category: employeeDocuments.category,
          label: employeeDocuments.label,
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
          category: dto.category,
          label: dto.label,
          fileName: file.originalname,
          mimeType: file.mimetype,
          dataUrl: toDataUri(file),
          uploadedById: uploadedById ?? undefined,
        })
        .returning({
          id: employeeDocuments.id,
          category: employeeDocuments.category,
          label: employeeDocuments.label,
          fileName: employeeDocuments.fileName,
          mimeType: employeeDocuments.mimeType,
          uploadedById: employeeDocuments.uploadedById,
          createdAt: employeeDocuments.createdAt,
        }),
    );
    return row;
  }

  async update(tenantId: string, employeeId: string, id: string, dto: UpdateDocumentDto) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .update(employeeDocuments)
        .set({ label: dto.label })
        .where(
          and(eq(employeeDocuments.tenantId, tenantId), eq(employeeDocuments.employeeId, employeeId), eq(employeeDocuments.id, id)),
        )
        .returning({
          id: employeeDocuments.id,
          category: employeeDocuments.category,
          label: employeeDocuments.label,
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
