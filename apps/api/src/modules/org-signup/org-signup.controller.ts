import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { RateLimitGuard } from '../../auth/rate-limit.guard';
import { OrgSignupService } from './org-signup.service';
import { CreateOrgSignupDto } from './dto/org-signup.dto';

/** Public — "Register your organisation" on the login page. No account exists yet. */
@Controller('org-signup')
export class OrgSignupController {
  constructor(private orgSignup: OrgSignupService) {}

  @Post()
  @UseGuards(RateLimitGuard(5, 10 * 60_000))
  create(@Body() dto: CreateOrgSignupDto) {
    return this.orgSignup.create(dto);
  }
}
