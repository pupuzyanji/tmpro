/** Document Type list for the redesigned Documents tab upload row (People
 *  profile / My Documents) — every upload picks one of these, whoever is
 *  uploading. Kept in sync by hand with `DOCUMENT_TYPES` in the API's
 *  employee-documents DTO — no shared package between the two apps to
 *  import this from. The API derives the legacy CONTRACT/ID/OTHER bucket
 *  each type falls under (still used by the Admin/HR tenant-wide Documents
 *  browser's three sections, and the "documents missing" reports) from this
 *  same list server-side — see `categoryForDocumentType` there. */
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

/** A document upload can't exceed this — enforced client-side (immediately,
 *  on file pick) and server-side (multer's fileSize limit on the upload
 *  endpoint). */
export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
