import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { IdentifyDto } from './dto/identify.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RateLimitGuard } from './rate-limit.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // 8 lookups per 5 minutes per (IP, email) — see RateLimitGuard for why
  // this endpoint specifically needs throttling.
  @Post('identify')
  @UseGuards(RateLimitGuard(8, 5 * 60_000))
  identify(@Body() dto: IdentifyDto) {
    return this.authService.identify(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // v019.A — the sidebar account menu's "Change password", every role.
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user, dto);
  }
}
