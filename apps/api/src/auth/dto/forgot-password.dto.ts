import { IsEmail, IsString, MinLength } from 'class-validator';

/** v027.A — public "Forgot password?" request from the sign-in page. The
 *  tenant slug comes from the identify step (the org the person chose). */
export class ForgotPasswordDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  tenantSlug!: string;
}
