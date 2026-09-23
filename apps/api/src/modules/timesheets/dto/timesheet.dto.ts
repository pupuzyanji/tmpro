import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsISO8601, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/; // "HH:mm", 24-hour — what <input type="time"> gives

export class BreakEntryDto {
  @Matches(TIME_PATTERN, { message: 'start must be HH:mm' })
  start!: string;

  @Matches(TIME_PATTERN, { message: 'end must be HH:mm' })
  end!: string;
}

/** One day's entry — shared shape for a single "Add Timesheet" and each row
 *  of "Add Weekly Timesheet" (see CreateWeeklyTimesheetDto). */
export class TimesheetEntryDto {
  @IsISO8601()
  date!: string;

  @Matches(TIME_PATTERN, { message: 'startTime must be HH:mm' })
  startTime!: string;

  @Matches(TIME_PATTERN, { message: 'endTime must be HH:mm' })
  endTime!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => BreakEntryDto)
  breaks?: BreakEntryDto[];

  @IsOptional()
  @IsString()
  workSite?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  workType?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateTimesheetDto extends TimesheetEntryDto {}

/** "Add Weekly Timesheet" — several days submitted in one call. Capped at
 *  14 (two weeks) as a sanity bound, not because a week is enforced — the
 *  frontend's weekly form always sends 7. */
export class CreateWeeklyTimesheetDto {
  @IsArray()
  @ArrayMaxSize(14)
  @ValidateNested({ each: true })
  @Type(() => TimesheetEntryDto)
  entries!: TimesheetEntryDto[];
}

/** PATCH — only while a timesheet is still PENDING (see TimesheetsService.update). */
export class UpdateTimesheetDto {
  @IsOptional()
  @IsISO8601()
  date?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'startTime must be HH:mm' })
  startTime?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'endTime must be HH:mm' })
  endTime?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => BreakEntryDto)
  breaks?: BreakEntryDto[];

  @IsOptional()
  @IsString()
  workSite?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  workType?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export const TIMESHEET_WORK_TYPES = ['Regular', 'Overtime', 'Public Holiday', 'Training', 'Travel'] as const;
export { TIME_PATTERN };
