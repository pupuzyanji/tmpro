import { IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'] as const;
const RIGHT_TO_WORK_OPTIONS = ['YES', 'NO', 'NEEDS_SPONSORSHIP'] as const;
const HOW_HEARD_OPTIONS = ['Job Board', 'Referral', 'Company Website', 'Social Media', 'Recruiter', 'Other'] as const;

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

  // v021.A — the job profile's skill list. Shown on the public job page and
  // matched against every applicant by the AI ATS (see ats.util.ts). Also
  // optional at creation for the same "quick add" reason as the fields
  // above — a requisition with no required skills yet just scores every
  // applicant as "Not scored" until this is filled in.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredSkills?: string[];

  // Recruiter's planning date for when they'd like the seat filled —
  // distinct from publishedAt (set automatically on approval). Shown at
  // requisition-raising time, not on the public careers page.
  @IsOptional()
  @IsDateString()
  targetStartDate?: string;
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

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredSkills?: string[];

  @IsOptional()
  @IsDateString()
  targetStartDate?: string;
}

/**
 * Public POST /requisitions/:id/apply — multipart (see RequisitionsController),
 * so every field except the two files (`cv`, `coverLetter`) arrives as form
 * text. The repeatable "add more" sections (education, workExperience,
 * skills) travel as JSON-encoded strings rather than proper nested DTOs
 * because class-validator's nested-array validation doesn't play well with
 * multipart/form-data fields (multer hands everything to `@Body()` as flat
 * strings) — RequisitionsService.apply parses and bounds each with
 * `parseJsonArray` (ats.util.ts) rather than trusting the client's shape.
 */
export class ApplyDto {
  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsString()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  linkedinUrl?: string;

  @IsOptional()
  @IsString()
  expectedSalary?: string;

  @IsOptional()
  @IsString()
  noticePeriod?: string;

  @IsOptional()
  @IsIn(RIGHT_TO_WORK_OPTIONS)
  rightToWork?: (typeof RIGHT_TO_WORK_OPTIONS)[number];

  @IsOptional()
  @IsIn(HOW_HEARD_OPTIONS)
  howHeard?: (typeof HOW_HEARD_OPTIONS)[number];

  /** JSON-encoded string[] of skill tags. */
  @IsOptional()
  @IsString()
  skills?: string;

  /** JSON-encoded EducationEntry[] — see ats.util.ts. */
  @IsOptional()
  @IsString()
  education?: string;

  /** JSON-encoded WorkExperienceEntry[] — see ats.util.ts. */
  @IsOptional()
  @IsString()
  workExperience?: string;

  /** Pre-v021.A field — kept for older frontend builds/direct API callers
   *  that still send a resume link instead of uploading a CV file. */
  @IsOptional()
  @IsString()
  resumeUrl?: string;
}

export { RIGHT_TO_WORK_OPTIONS, HOW_HEARD_OPTIONS };
