import { ArrayUnique, IsArray, IsEmail, IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { MODULE_KEYS, type ModuleKey } from '../../common/modules/module-catalog';

/** Platform Admin > Tenants > "Edit" (v019.A) — replaces the old
 *  UpdateTenantEntitlementsDto (modules/seat cap only) now that Edit also
 *  covers the organisation name and the tenant admin's own name/email/
 *  password. Every field is optional and independently patchable: send
 *  only what changed. `password` is a reset, not required on every save —
 *  omit it to leave the admin's current password unchanged. */
export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  organisationName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  adminFirstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  adminLastName?: string;

  @IsOptional()
  @IsEmail()
  adminEmail?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(MODULE_KEYS, { each: true })
  enabledModules?: ModuleKey[];

  // undefined = leave unchanged; null = clear back to unlimited.
  @IsOptional()
  @IsInt()
  @Min(0)
  seatCap?: number | null;
}
