import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RateLimitGuard } from '../../auth/rate-limit.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { DataExportService } from './data-export.service';

@Controller('data-export')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DataExportController {
  constructor(private exporter: DataExportService) {}

  /** v027.A — Admin-only full export as a ZIP. Limited to 5 per 15 minutes
   *  per IP since it reads the whole workspace. */
  @Get()
  @Roles('ADMIN')
  @UseGuards(RateLimitGuard(5, 15 * 60_000))
  async download(@CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    const { filename, zip } = await this.exporter.buildExport(user.tenantId);
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(zip.byteLength),
      'Cache-Control': 'no-store',
      'Access-Control-Expose-Headers': 'Content-Disposition',
    });
    res.end(Buffer.from(zip));
  }
}
