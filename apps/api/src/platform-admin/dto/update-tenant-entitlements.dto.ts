import { ArrayUnique, IsArray, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { MODULE_KEYS, type ModuleKey } from '../../common/modules/module-catalog';

export class UpdateTenantEntitlementsDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(MODULE_KEYS, { each: true })
  enabledModules?: ModuleKey[];

  // Seat cap on active (non-alumni) employees. Omit the field to leave it
  // unchanged; send null explicitly to clear it back to unlimited (see
  // UpdateTenantEntitlementsDto's controller-side handling — `undefined` vs
  // `null` is meaningful here, same pattern as UpdateAnnouncementDto's
  // scope-clearing fields in settings.service.ts).
  @IsOptional()
  @IsInt()
  @Min(0)
  seatCap?: number | null;
}
