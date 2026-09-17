import { IsEmail } from 'class-validator';

/** Step 1 of the identifier-first login flow — see AuthService.identify(). */
export class IdentifyDto {
  @IsEmail()
  email!: string;
}
