import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

export class CreateGoalDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;
}

export class UpdateGoalStatusDto {
  @IsIn(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'])
  status!: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
}
