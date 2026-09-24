import { Body, Controller, Get, Headers, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RateLimitGuard } from '../../auth/rate-limit.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { BillingService } from './billing.service';
import { ChangePlanDto, SelfServeSignupDto } from './dto/billing.dto';

/**
 * v025.A — subscription billing (Stripe).
 *
 * Public: the plan catalogue, FX estimates for the pricing page, self-serve
 * sign-up (→ Stripe Checkout), the post-checkout status poll, and Stripe's
 * webhook (authenticated by its signature, not a JWT — main.ts hands this
 * one route the raw request body so the signature can be verified).
 *
 * Tenant: Settings → Billing (Admin only) and the app-shell banner.
 */
@Controller('billing')
export class BillingPublicController {
  constructor(private billing: BillingService) {}

  @Get('plans')
  plans() {
    return this.billing.catalogue();
  }

  @Get('fx')
  fx() {
    return this.billing.fx();
  }

  @Post('signup')
  @UseGuards(RateLimitGuard(5, 10 * 60_000))
  signup(@Body() dto: SelfServeSignupDto) {
    return this.billing.signup(dto);
  }

  @Get('checkout-status')
  @UseGuards(RateLimitGuard(60, 10 * 60_000))
  checkoutStatus(@Query('session_id') sessionId: string) {
    return this.billing.checkoutStatus(sessionId);
  }

  @Post('webhook')
  @HttpCode(200)
  webhook(@Req() req: Request, @Headers('stripe-signature') signature: string | undefined) {
    const raw = Buffer.isBuffer(req.body) ? (req.body as Buffer) : undefined;
    return this.billing.handleWebhook(raw, signature);
  }
}

@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingController {
  constructor(private billing: BillingService) {}

  @Get('banner')
  banner(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.banner(user.tenantId, user.role);
  }

  @Get('summary')
  @Roles('ADMIN')
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.summary(user.tenantId);
  }

  @Post('portal')
  @Roles('ADMIN')
  portal(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.portal(user.tenantId);
  }

  @Post('change')
  @Roles('ADMIN')
  change(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePlanDto) {
    return this.billing.changePlan(user.tenantId, dto);
  }

  @Post('contact-sales')
  @Roles('ADMIN')
  contactSales(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.contactSales(user.tenantId, user.userId);
  }
}
