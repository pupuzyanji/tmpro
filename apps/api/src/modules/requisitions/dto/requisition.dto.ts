import { IsIn, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'] as const;

export class CreateRequisitionDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  headcount?: number;

  @IsOptional()
  @IsNumber()
  budget?: number;

  // --- Public careers-page content — shown once this requisition is
  // APPROVED (see RequisitionsService.approve / CareersService). All
  // optional at creation time so the existing "quick add" flow still works;
  // a requisition can be fleshed out with these before it's approved.
  @IsOptional()
  @IsIn(EMPLOYMENT_TYPES)
  employmentType?: (typeof EMPLOYMENT_TYPES)[number];

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  roleSummary?: string;

  @IsOptional()
  @IsString()
  whatYoullDo?: string;

  @IsOptional()
  @IsString()
  whatYoullBring?: string;

  @IsOptional()
  @IsString()
  whatYoullGet?: string;

  @IsOptional()
  @IsString()
  whyUs?: string;
}

/** PATCH /requisitions/:id — every field optional; only what's sent is changed. */
export class UpdateRequisitionDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  headcount?: number;

  @IsOptional()
  @IsNumber()
  budget?: number;

  @IsOptional()
  @IsIn(EMPLOYMENT_TYPES)
  employmentType?: (typeof EMPLOYMENT_TYPES)[number];

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  roleSummary?: string;

  @IsOptional()
  @IsString()
  whatYoullDo?: string;

  @IsOptional()
  @IsString()
  whatYoullBring?: string;

  @IsOptional()
  @IsString()
  whatYoullGet?: string;

  @IsOptional()
  @IsString()
  whyUs?: string;
}

export class ApplyDto {
  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsString()
  email!: string;

  @IsOptional()
  @IsString()
  resumeUrl?: string;
}
