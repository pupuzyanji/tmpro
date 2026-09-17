import { IsISO8601, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateLeaveRequestDto {
  @IsUUID()
  leaveTypeId!: string;

  @IsISO8601()
  startDate!: string;

  @IsISO8601()
  endDate!: string;

  @IsNumber()
  @Min(0.5)
  days!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
