import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RateLimitGuard } from '../../auth/rate-limit.guard';
import { PlatformAdminJwtAuthGuard } from '../../platform-admin/platform-admin-jwt-auth.guard';
import { MarketingService } from './marketing.service';
import { CreateLinkDto, LinkClickDto, MarketingEventDto, UpdateLinkDto } from './marketing.dto';

/** Public — called by the public pages and by the web app's /go/<slug>
 *  redirect. No account exists yet. */
@Controller('marketing')
export class MarketingController {
  constructor(private marketing: MarketingService) {}

  @Post('event')
  @UseGuards(RateLimitGuard(120, 60_000))
  event(@Body() dto: MarketingEventDto, @Headers('user-agent') ua?: string) {
    return this.marketing.event(dto, ua);
  }

  @Post('click')
  click(@Body() dto: LinkClickDto) {
    return this.marketing.click(dto);
  }
}

@Controller('platform-admin/marketing')
@UseGuards(PlatformAdminJwtAuthGuard)
export class MarketingAdminController {
  constructor(private marketing: MarketingService) {}

  @Get('links')
  links() {
    return this.marketing.listLinks();
  }

  @Post('links')
  create(@Body() dto: CreateLinkDto) {
    return this.marketing.createLink(dto);
  }

  @Patch('links/:id')
  update(@Param('id') id: string, @Body() dto: UpdateLinkDto) {
    return this.marketing.updateLink(id, dto);
  }

  @Get('sources')
  sources(@Query('days') days?: string) {
    const n = Number(days);
    return this.marketing.sources(Number.isFinite(n) && n > 0 && n <= 730 ? Math.round(n) : 30);
  }
}
