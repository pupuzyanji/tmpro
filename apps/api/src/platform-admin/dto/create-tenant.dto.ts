import { ArrayUnique, IsArray, IsEmail, IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { MODULE_KEYS, type ModuleKey } from '../../common/modules/module-catalog';

/** Platform Admin > Tenants > "Add Tenant" (v019.A). Creates the tenant row
 *  AND its first ADMIN login in one call — see TenantsAdminService.create().
 *  The new tenant always starts INACTIVE (the `tenants.status` column's DB
 *  default) regardless of what's sent here; only an explicit Activate
 *  action moves it to the Active tab. */
export class CreateTenantDto {
  @IsString()
  @MinLength(1)
  adminFirstName!: string;

  @IsString()
  @MinLength(1)
  adminLastName!: string;

  @IsString()
  @MinLength(1)
  organisationName!: string;

  @IsEmail()
  adminEmail!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(MODULE_KEYS, { each: true })
  enabledModules?: ModuleKey[];

  // Omit or null = unlimited.
  @IsOptional()
  @IsInt()
  @Min(0)
  seatCap?: number | null;
}
