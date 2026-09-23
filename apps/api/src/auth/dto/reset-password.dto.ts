import { IsString, MinLength } from 'class-validator';

/** Public — completes an admin-initiated password reset (v023.A). The
 *  token comes from the one-time link EmployeesService.resetPassword()
 *  emails to the account's login address; no email or tenant slug is
 *  needed here, since the token alone identifies the account (matched
 *  against users.resetTokenHash — see AuthService.resetPasswordWithToken()). */
export class CompletePasswordResetDto {
  @IsString()
  @MinLength(1)
  token!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
