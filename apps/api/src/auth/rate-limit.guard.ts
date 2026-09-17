import { CanActivate, ExecutionContext, HttpException, HttpStatus, Type, mixin } from '@nestjs/common';

/**
 * Minimal in-memory sliding-window rate limiter — no Redis/shared store, so
 * it only limits per API process. That's fine for this scaffold's
 * single-instance deployment; a horizontally-scaled one would need a shared
 * store instead (same caveat as any other in-memory state in this codebase).
 *
 * Used on POST /auth/identify, which — by design, see AuthService.identify()
 * — can confirm whether an email is registered and which organization(s) it
 * belongs to, before any password is checked. Throttling narrows how fast
 * that can be probed; it doesn't eliminate the leak, which is an accepted
 * trade-off of identifier-first login (Slack/Okta/Dropbox all make the same
 * one).
 *
 * Keyed by IP + the submitted email together, so one IP working through a
 * list of emails is still bounded per-address, while a shared office IP
 * doesn't get everyone else in the building rate-limited by one person's
 * attempts.
 */
export function RateLimitGuard(limit: number, windowMs: number): Type<CanActivate> {
  class RateLimitGuardMixin implements CanActivate {
    private hits = new Map<string, number[]>();

    canActivate(context: ExecutionContext): boolean {
      const req = context.switchToHttp().getRequest();
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const key = `${req.ip ?? 'unknown'}:${email}`;
      const now = Date.now();
      const windowStart = now - windowMs;

      const recent = (this.hits.get(key) ?? []).filter((t) => t > windowStart);
      if (recent.length >= limit) {
        throw new HttpException('Too many attempts. Please wait a moment and try again.', HttpStatus.TOO_MANY_REQUESTS);
      }
      recent.push(now);
      this.hits.set(key, recent);
      return true;
    }
  }
  return mixin(RateLimitGuardMixin);
}
