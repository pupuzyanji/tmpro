import { IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';
export type MaritalStatus = 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED';

/** Fields shared by create and update that come from Settings → Employees
 *  (structured org links) rather than the original free-text scaffold. */
class OrgLinkedFieldsDto {
  @IsOptional()
  @IsString()
  employeeCode?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsUUID()
  designationId?: string;

  @IsOptional()
  @IsString()
  sourceOfHire?: string;

  @IsOptional()
  @IsIn(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'])
  employmentType?: EmploymentType;

  @IsOptional()
  @IsString()
  workPhone?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;
}

export class CreateEmployeeDto extends OrgLinkedFieldsDto {
  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;
}

/** Update-only: the "General Info → Personal Details" fields from the
 *  reference screenshots, filled in after the employee record exists (from
 *  the People profile page, not the Settings → Employees creation form). All
 *  are flattened directly onto UpdateEmployeeDto — not nested — so PATCH
 *  /employees/:id can take them alongside org-linked and basic fields in one
 *  call from the General Info tab. */
export class UpdateEmployeeDto extends OrgLinkedFieldsDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;

  // Was missing from this DTO even though the Work section's Country field
  // has always PATCHed it — with `whitelist: true` on the global
  // ValidationPipe, that meant Country edits were silently dropped before
  // reaching the service. Fixed here as part of folding Work into Job
  // Information's history log (v020.A), which also denormalizes it.
  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsIn(['ONBOARDING', 'ACTIVE', 'ON_LEAVE', 'OFFBOARDING', 'ALUMNI'])
  status?: string;

  @IsOptional()
  @IsNumber()
  annualSalary?: number;

  // Settings > Employees' Timesheets toggle (v022.A) — whether this
  // employee is allocated the Timesheets feature (see
  // employees.timesheetsEnabled in schema.ts). Admin/HR only, same as
  // every other field on this DTO.
  @IsOptional()
  @IsBoolean()
  timesheetsEnabled?: boolean;

  // --- Personal Details ---------------------------------------------------

  @IsOptional()
  @IsString()
  email?: string; // personal email — distinct from the login account email

  @IsOptional()
  @IsString()
  mobileNo?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'])
  gender?: Gender;

  @IsOptional()
  @IsIn(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED'])
  maritalStatus?: MaritalStatus;

  @IsOptional()
  @IsString()
  nationality?: string;

  @IsOptional()
  @IsString()
  bloodGroup?: string;

  // ID No (formerly "Driver Licence") — the employee's primary government
  // identification number.
  @IsOptional()
  @IsString()
  idNo?: string;

  @IsOptional()
  @IsString()
  ssn?: string;

  @IsOptional()
  @IsString()
  nhiId?: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsString()
  hobbies?: string;

  @IsOptional()
  @IsString()
  fatherName?: string;

  @IsOptional()
  @IsString()
  motherName?: string;

  @IsOptional()
  @IsString()
  spouseName?: string;

  @IsOptional()
  @IsString()
  address1?: string;

  @IsOptional()
  @IsString()
  address2?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  zipCode?: string;
}
