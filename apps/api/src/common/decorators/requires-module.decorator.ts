import { SetMetadata } from '@nestjs/common';
import type { ModuleKey } from '../modules/module-catalog';

export const REQUIRES_MODULE_KEY = 'requiresModule';

/** Marks a controller (or one route) as gated behind a tenant module
 *  entitlement — checked by `ModuleGuard`. See module-catalog.ts for the
 *  full key list and which ones are actually gateable. */
export const RequiresModule = (module: ModuleKey) => SetMetadata(REQUIRES_MODULE_KEY, module);
