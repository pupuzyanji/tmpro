import { IsIn, IsOptional, IsString } from 'class-validator';

/** Document Type list for the Documents tab's upload row (People profile /
 *  My Documents) — every upload picks one of these, whoever is uploading.
 *  Kept in sync by hand with `DOCUMENT_TYPES` in apps/web's document-tags
 *  lib — no shared package between the two apps to import this from. */
export const DOCUMENT_TYPES = [
  'Signed Contract Document',
  'Passport',
  'Visa / Work Permit',
  "Driver's Licence",
  'National ID Card',
  'Tax Number Document',
  'Bank Account Details Letter',
  'Pension / Superannuation Forms',
  'Educational Qualification',
  'Professional Licenses / Certifications',
  'Criminal Background Report',
  'Credit Check Report',
  'Reference Letters',
  'Medical / Fitness-for-Duty Certificates',
  'Marriage Certificate',
  'Proof of Address',
  'Other',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** The pre-redesign CONTRACT/ID/OTHER category still exists on the table —
 *  the Admin/HR tenant-wide Documents browser groups by it, and the
 *  "documents missing" compliance reports (Settings > Reports) filter by
 *  it — but it's no longer something the uploader picks directly. It's
 *  derived here from the Document Type they did pick, once, so the two
 *  never drift apart. */
export function categoryForDocumentType(type: DocumentType): 'CONTRACT' | 'ID' | 'OTHER' {
  if (type === 'Signed Contract Document') return 'CONTRACT';
  if (type === 'Passport' || type === 'Visa / Work Permit' || type === "Driver's Licence" || type === 'National ID Card') {
    return 'ID';
  }
  return 'OTHER';
}

export class UploadDocumentDto {
  /** What the document actually is — see DOCUMENT_TYPES. Replaces the old
   *  category + optional tag pair; the service derives category from this. */
  @IsIn(DOCUMENT_TYPES)
  documentType!: DocumentType;

  /** The name given to the file at upload — shown in the document list. */
  @IsString()
  label!: string;
}

export class UpdateDocumentDto {
  /** Rename a previously uploaded document. */
  @IsString()
  label!: string;

  /** Re-pick the Document Type on a previously uploaded document. Optional —
   *  omitted when the edit only touches the name — so a document uploaded
   *  before this field existed can still be renamed without being forced to
   *  pick a type first. Re-derives `category` the same way a fresh upload
   *  does, so it never drifts from Document Type. */
  @IsOptional()
  @IsIn(DOCUMENT_TYPES)
  documentType?: DocumentType;
}
