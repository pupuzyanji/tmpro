import { IsIn, IsISO8601, IsOptional, IsString, Length } from 'class-validator';

export class RunPayrollDto {
  @IsISO8601()
  periodStart!: string;

  @IsISO8601()
  periodEnd!: string;

  @IsString()
  @Length(2, 2)
  countryCode!: string;
}

/** Admin edit-in-place for an already-executed pay run — the period dates
 *  or status (e.g. correcting DRAFT/APPROVED/PAID after the fact). Does not
 *  recompute payslips; use Delete + re-run Payroll if the figures themselves
 *  need to change. */
export class UpdatePayRunDto {
  @IsOptional()
  @IsISO8601()
  periodStart?: string;

  @IsOptional()
  @IsISO8601()
  periodEnd?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'APPROVED', 'PAID'])
  status?: 'DRAFT' | 'APPROVED' | 'PAID';
}
