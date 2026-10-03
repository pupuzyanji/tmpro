import { IsObject, IsOptional, IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { BAND_KEYS, PLAN_KEYS, type BandKey, type PlanKey } from '../../../common/billing/plans';

/** Public self-serve sign-up (v025.A): creates the tenant + its first Admin
 *  login, then hands back a Stripe Checkout URL to collect a card. */
export class SelfServeSignupDto {
  @IsIn(PLAN_KEYS as unknown as string[])
  plan!: PlanKey;

  @IsIn(BAND_KEYS as unknown as string[])
  band!: BandKey;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  organisationName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  country!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(40)
  phone!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;

  // v031.A — the campaign they came from; see modules/marketing/attribution.ts.
  @IsOptional()
  @IsObject()
  attribution?: Record<string, unknown>;
}

/** Settings → Billing: switch plan and/or size band. */
export class ChangePlanDto {
  @IsIn(PLAN_KEYS as unknown as string[])
  plan!: PlanKey;

  @IsIn(BAND_KEYS as unknown as string[])
  band!: BandKey;
}
