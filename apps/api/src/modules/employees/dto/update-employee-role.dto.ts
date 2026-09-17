import { IsIn } from 'class-validator';

// Deliberately excludes CANDIDATE — this endpoint edits an existing
// employee's internal HR login (Permission tab), not the separate
// candidate-application flow.
export const EDITABLE_ROLES = ['EMPLOYEE', 'SUPERVISOR', 'HR', 'ADMIN'] as const;
export type EditableRole = (typeof EDITABLE_ROLES)[number];

export class UpdateEmployeeRoleDto {
  @IsIn(EDITABLE_ROLES)
  role!: EditableRole;
}
