import { IsIn, IsString } from 'class-validator';

export class UploadDocumentDto {
  @IsIn(['CONTRACT', 'ID', 'OTHER'])
  category!: 'CONTRACT' | 'ID' | 'OTHER';

  /** The name given to the file at upload — shown in the document list. */
  @IsString()
  label!: string;
}

export class UpdateDocumentDto {
  /** Rename a previously uploaded document. */
  @IsString()
  label!: string;
}
