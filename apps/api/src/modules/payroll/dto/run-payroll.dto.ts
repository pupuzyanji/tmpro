import { IsArray, IsBoolean, IsInt, IsISO8601, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class RunPayrollDto {
  @IsISO8601()
  periodStart!: string;

  @IsISO8601()
  periodEnd!: string;

  @IsString()
  @Length(2, 2)
  countryCode!: string;

  /** v030.A — the day staff are paid; defaults to the period end. */
  @IsOptional()
  @IsISO8601()
  payDate?: string;
}

/** v030.A — edits a DRAFT run's period or pay date (status now changes
 *  only through the run's stages: submit, approve, send back, reopen, paid). */
export class UpdatePayRunDto {
  @IsOptional()
  @IsISO8601()
  periodStart?: string;

  @IsOptional()
  @IsISO8601()
  periodEnd?: string;

  @IsOptional()
  @IsISO8601()
  payDate?: string;
}

/** v030.A — submit / approve / send back / reopen. */
export class PayRunActionDto {
  @IsOptional()
  @IsString()
  comment?: string;

  /** Submit only: the preparer accepts the open "check" items. */
  @IsOptional()
  @IsBoolean()
  acknowledgeChecks?: boolean;
}

/** v030.A — Settings → Payroll → Approvals, per country. */
export class ApprovalSettingsDto {
  @IsOptional() @IsInt() @Min(1) @Max(2) approvalsRequired?: number;
  @IsOptional() @IsNumber() secondWhenCostOver?: number | null;
  @IsOptional() @IsNumber() secondWhenIncreasePct?: number | null;
  @IsOptional() @IsBoolean() secondWhenOverride?: boolean;
  @IsOptional() @IsBoolean() preparerCannotApprove?: boolean;
  @IsOptional() @IsBoolean() sendBackNeedsComment?: boolean;
  @IsOptional() @IsBoolean() notifyOnSubmit?: boolean;
  @IsOptional() @IsBoolean() notifyOnDecision?: boolean;
  @IsOptional() @IsArray() approvers?: Array<{ userId: string; level: '1' | '2' | 'ANY' }>;
}

export class CanApproveDto {
  @IsBoolean() canApprovePayroll!: boolean;
}
