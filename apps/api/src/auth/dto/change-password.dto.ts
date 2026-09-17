import { IsString, MinLength } from 'class-validator';

/** Self-service password change from the sidebar's account menu (v019.A) —
 *  every role (Admin, Supervisor, Employee) gets this, not just Admins.
 *  Requires the current password so a momentarily unlocked/unattended
 *  session can't be hijacked into a full account takeover just by opening
 *  this menu — see AuthService.changePassword(). */
export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
