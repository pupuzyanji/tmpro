import { IsBoolean, IsIn, IsObject, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const EVENT_TYPES = ['visit', 'pricing_view', 'plan_click', 'signup'] as const;

export class MarketingEventDto {
  @IsIn(EVENT_TYPES as unknown as string[])
  type!: (typeof EVENT_TYPES)[number];

  @IsOptional() @IsString() @MaxLength(300)
  path?: string;

  @IsOptional() @IsString() @MaxLength(120)
  detail?: string;

  @IsOptional() @IsObject()
  attribution?: Record<string, unknown>;
}

export class LinkClickDto {
  @IsString() @MaxLength(80)
  slug!: string;

  @IsOptional() @IsString() @MaxLength(400)
  userAgent?: string;

  @IsOptional() @IsString() @MaxLength(8)
  country?: string;
}

export class CreateLinkDto {
  @Matches(/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/, { message: 'Use 3–80 lower-case letters, numbers and dashes for the short name.' })
  slug!: string;

  // An internal page only (starts with one "/") — a short link can never be
  // pointed at another website.
  @Matches(/^\/(?!\/)[A-Za-z0-9\-._~\/?=&%]*$/, { message: 'The destination must be a tmPro page, such as /pricing.' })
  @MaxLength(300)
  destination!: string;

  @IsString() @MinLength(1) @MaxLength(80)
  source!: string;

  @IsOptional() @IsString() @MaxLength(80)
  medium?: string;

  @IsOptional() @IsString() @MaxLength(120)
  campaign?: string;

  @IsOptional() @IsString() @MaxLength(160)
  content?: string;
}

export class UpdateLinkDto {
  @IsOptional()
  @Matches(/^\/(?!\/)[A-Za-z0-9\-._~\/?=&%]*$/, { message: 'The destination must be a tmPro page, such as /pricing.' })
  @MaxLength(300)
  destination?: string;

  @IsOptional() @IsBoolean()
  active?: boolean;
}
