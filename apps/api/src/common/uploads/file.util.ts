import { BadRequestException } from '@nestjs/common';

/** No object storage in this scaffold yet — small uploads (logos, portrait
 *  photos, contract/ID PDFs) are stored inline as data URIs. Fine at demo
 *  scale; a real object-storage layer (S3-compatible, per the build
 *  framework) is the natural next step if upload volume grows. */
export function toDataUri(file: Express.Multer.File): string {
  return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
}

export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
export const PDF_MIME_TYPE = 'application/pdf';
export const DOCUMENT_MIME_TYPES = [PDF_MIME_TYPE, ...IMAGE_MIME_TYPES];

export function assertMimeType(file: Express.Multer.File | undefined, allowed: string[], label = 'file'): asserts file {
  if (!file) throw new BadRequestException(`No ${label} was uploaded.`);
  if (!allowed.includes(file.mimetype)) {
    throw new BadRequestException(`Unsupported ${label} type "${file.mimetype}".`);
  }
}
