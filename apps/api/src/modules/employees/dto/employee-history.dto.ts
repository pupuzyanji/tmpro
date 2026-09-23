import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

export class AddStatusHistoryDto {
  @IsIn(['ONBOARDING', 'ACTIVE', 'ON_LEAVE', 'OFFBOARDING', 'ALUMNI'])
  status!: 'ONBOARDING' | 'ACTIVE' | 'ON_LEAVE' | 'OFFBOARDING' | 'ALUMNI';

  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class AddTypeHistoryDto {
  @IsIn(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'])
  employmentType!: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN';

  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class CompensationAllowanceDto {
  @IsIn(['HOUSING', 'TRANSPORT_VEHICLE', 'MEAL_LUNCH', 'OTHER'])
  type!: 'HOUSING' | 'TRANSPORT_VEHICLE' | 'MEAL_LUNCH' | 'OTHER';

  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class AddCompensationHistoryDto {
  /** "Basic Pay Rate" in the UI — the base figure before allowances, read
   *  by every native payroll ruleset the same way regardless of country. */
  @IsNumber()
  payRate!: number;

  @IsOptional()
  @IsIn(['MONTHLY', 'ANNUAL', 'HOURLY'])
  payType?: 'MONTHLY' | 'ANNUAL' | 'HOURLY';

  /** Currency this rate is recorded in — defaults to the Organization's
   *  configured currency but is adjustable per entry. */
  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  changeReason?: string;

  /** Repeatable allowance line items (Housing, Transport/Vehicle,
   *  Meal/Lunch, Other) — every native payroll ruleset sums these by type
   *  alongside the Basic Pay Rate to compute gross pay. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CompensationAllowanceDto)
  allowances?: CompensationAllowanceDto[];

  /** Contracted hours/week this rate assumes — omit for full-time standard
   *  (40). A different value from the employee's previous Compensation
   *  entry is how a working-hours change (e.g. moving to part-time) is
   *  recorded; payroll's proration engine scales MONTHLY/ANNUAL pay by
   *  hoursPerWeek/standard and reads it directly as HOURLY's weekly hours. */
  @IsOptional()
  @IsNumber()
  hoursPerWeek?: number;

  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class AddJobHistoryDto {
  /** Which Branch this entry's Location resolves to — the server derives
   *  the denormalized `location` text ("Town/City, Country") from this. */
  @IsOptional()
  @IsUUID()
  locationBranchId?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  designationId?: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;

  // v020.A — absorbed from General Info's removed "Work" section (see
  // AddJobHistoryDto's counterpart fields above for the pattern this
  // follows: optional, denormalizes onto the employee record).
  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsString()
  sourceOfHire?: string;

  @IsOptional()
  @IsString()
  workPhone?: string;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

// --- Update DTOs (PATCH — Admin edit-in-place for any past entry) ---------

export class UpdateStatusHistoryDto {
  @IsOptional()
  @IsIn(['ONBOARDING', 'ACTIVE', 'ON_LEAVE', 'OFFBOARDING', 'ALUMNI'])
  status?: 'ONBOARDING' | 'ACTIVE' | 'ON_LEAVE' | 'OFFBOARDING' | 'ALUMNI';

  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class UpdateTypeHistoryDto {
  @IsOptional()
  @IsIn(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'])
  employmentType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN';

  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class UpdateCompensationHistoryDto {
  @IsOptional()
  @IsNumber()
  payRate?: number;

  @IsOptional()
  @IsIn(['MONTHLY', 'ANNUAL', 'HOURLY'])
  payType?: 'MONTHLY' | 'ANNUAL' | 'HOURLY';

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  changeReason?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CompensationAllowanceDto)
  allowances?: CompensationAllowanceDto[];

  @IsOptional()
  @IsNumber()
  hoursPerWeek?: number;

  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class UpdateJobHistoryDto {
  @IsOptional()
  @IsUUID()
  locationBranchId?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  designationId?: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsString()
  sourceOfHire?: string;

  @IsOptional()
  @IsString()
  workPhone?: string;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
