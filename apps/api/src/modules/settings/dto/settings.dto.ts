import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsAlphanumeric,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  tagline?: string;

  // Structured address — replaces the old single free-text `address` field.
  @IsOptional()
  @IsString()
  street?: string;

  @IsOptional()
  @IsString()
  townCity?: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  workingHoursStart?: string;

  @IsOptional()
  @IsString()
  workingHoursEnd?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  // Company-level regulatory identifiers, referenced when generating
  // Regulatory Submission return files on the Payroll page.
  @IsOptional()
  @IsAlphanumeric()
  superannuationNo?: string;

  @IsOptional()
  @IsAlphanumeric()
  taxId?: string;

  @IsOptional()
  @IsAlphanumeric()
  healthInsuranceId?: string;
}

export class CreateBranchDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1)
  isHeadOffice?: number;

  @IsOptional()
  @IsString()
  street?: string;

  @IsOptional()
  @IsString()
  townCity?: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  country?: string;
}

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1)
  isHeadOffice?: number;

  @IsOptional()
  @IsString()
  street?: string;

  @IsOptional()
  @IsString()
  townCity?: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  country?: string;
}

export class CreateDepartmentDto {
  @IsString()
  name!: string;
}

export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  name?: string;
}

export class CreateSectionDto {
  @IsUUID()
  departmentId!: string;

  @IsString()
  name!: string;
}

export class UpdateSectionDto {
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class CreateDesignationDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsUUID()
  reportsToDesignationId?: string;
}

export class UpdateDesignationDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsUUID()
  reportsToDesignationId?: string;
}

export class CreateAnnouncementDto {
  @IsString()
  title!: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsIn(['ORGANIZATION', 'DEPARTMENT', 'SECTION'])
  scope?: 'ORGANIZATION' | 'DEPARTMENT' | 'SECTION';

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;
}

export class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsIn(['ORGANIZATION', 'DEPARTMENT', 'SECTION'])
  scope?: 'ORGANIZATION' | 'DEPARTMENT' | 'SECTION';

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;
}

// --- Leave (Settings → Leave: per-country-regime leave-type catalog) -------

export class LeaveTypeRowDto {
  @IsUUID()
  id!: string;

  @IsNumber()
  @Min(0)
  defaultAnnualDays!: number;

  @IsIn(['DAILY', 'MONTHLY', 'ANNUALLY'])
  accrualPeriod!: 'DAILY' | 'MONTHLY' | 'ANNUALLY';

  @IsBoolean()
  carryOverEnabled!: boolean;
}

export class BulkUpdateLeaveTypesDto {
  @IsIn(['ZM', 'NZ', 'MW', 'ZA', 'OTHER'])
  countryCode!: string;

  @ValidateNested({ each: true })
  @Type(() => LeaveTypeRowDto)
  @ArrayMinSize(1)
  rows!: LeaveTypeRowDto[];
}
