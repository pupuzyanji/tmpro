import { IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

/** Performance tab → "Performance Reviews" table: an ad-hoc scored review,
 *  distinct from the formal review-cycle workflow in `performanceReviews`. */
export class CreateReviewEntryDto {
  @IsOptional()
  @IsUUID()
  reviewerId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  jobKnowledge?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  workQuality?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  attendance?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  communication?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  dependability?: number;

  @IsOptional()
  @IsISO8601()
  date?: string;
}

export class UpdateReviewEntryDto {
  @IsOptional()
  @IsUUID()
  reviewerId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  jobKnowledge?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  workQuality?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  attendance?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  communication?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  dependability?: number;

  @IsOptional()
  @IsISO8601()
  date?: string;
}

/** Performance tab → "Performance Comments" table: free-text notes. */
export class CreateCommentDto {
  @IsString()
  comment!: string;

  @IsOptional()
  @IsUUID()
  reviewerId?: string;

  @IsOptional()
  @IsISO8601()
  date?: string;
}

export class UpdateCommentDto {
  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsUUID()
  reviewerId?: string;

  @IsOptional()
  @IsISO8601()
  date?: string;
}

/** Performance tab → "Performance Goals" table. Admin can set the assigned
 *  supervisor and both self/supervisor assessments alongside the goal
 *  itself, since the whole tab is Admin-editable per the People-profile spec. */
export class CreateEmployeeGoalDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsUUID()
  supervisorId?: string;

  @IsOptional()
  @IsIn(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'])
  status?: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

  @IsOptional()
  @IsString()
  employeeAssessment?: string;

  @IsOptional()
  @IsString()
  supervisorAssessment?: string;
}

export class UpdateEmployeeGoalDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsUUID()
  supervisorId?: string;

  @IsOptional()
  @IsIn(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'])
  status?: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

  @IsOptional()
  @IsString()
  employeeAssessment?: string;

  @IsOptional()
  @IsString()
  supervisorAssessment?: string;
}
