import { IsEmail } from 'class-validator';

/** People profile → Permission tab's "Account email" editor (v023.A) —
 *  changes the LOGIN email on an employee's linked `users` row. Distinct
 *  from `employees.email` (their personal email on the Personal Details
 *  tab), which is only ever copied into the login once, at Generate Login
 *  time (see EmployeesService.generateLogin) — after that the two are
 *  independent, and this is the only thing that updates the login one. */
export class UpdateAccountEmailDto {
  @IsEmail()
  email!: string;
}
