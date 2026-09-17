import { ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreatePayrollAdjustmentDto {
  /** One or more employees to apply the same addition/deduction to — lets an
   *  Admin raise, say, an identical bonus for a whole team in one submission. */
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  employeeIds!: string[];

  @IsIn(['ADDITION', 'DEDUCTION'])
  type!: 'ADDITION' | 'DEDUCTION';

  @IsString()
  label!: string;

  @IsNumber()
  amount!: number;

  /** How many upcoming pay runs to spread this over — 1 (default) for a
   *  one-off bonus or single deduction, or more for e.g. an advance clawed
   *  back over several runs. */
  @IsOptional()
  @IsInt()
  @Min(1)
  occurrences?: number;
}

/** Edits a still-PENDING adjustment in place — every field optional so a
 *  caller only sends what changed. Which employee it's for isn't editable
 *  (create a new adjustment for that); everything else is. */
export class UpdatePayrollAdjustmentDto {
  @IsOptional()
  @IsIn(['ADDITION', 'DEDUCTION'])
  type?: 'ADDITION' | 'DEDUCTION';

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  occurrences?: number;
}
