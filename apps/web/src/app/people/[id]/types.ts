// Shared types for the People profile page and its tabs.

export interface EmployeeDetail {
  id: string;
  employeeCode: string | null;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  jobTitle: string | null;
  department: string | null;
  countryCode: string;
  status: string;
  managerId: string | null;
  annualSalary: number | null;
  startDate: string;

  branchId: string | null;
  departmentId: string | null;
  sectionId: string | null;
  designationId: string | null;

  sourceOfHire: string | null;
  employmentType: string;
  workPhone: string | null;
  location: string | null;

  email: string | null;
  mobileNo: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  maritalStatus: string | null;
  nationality: string | null;
  bloodGroup: string | null;
  idNo: string | null;
  ssn: string | null;
  nhiId: string | null;
  taxId: string | null;
  hobbies: string | null;
  fatherName: string | null;
  motherName: string | null;
  spouseName: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  zipCode: string | null;

  manager: { id: string; firstName: string; lastName: string } | null;
  account: { email: string; role: string } | null;
}

export interface EmployeeOption {
  id: string;
  firstName: string;
  lastName: string;
}
export interface BranchOption {
  id: string;
  name: string;
  townCity: string | null;
  country: string | null;
}
export interface DepartmentOption {
  id: string;
  name: string;
}
export interface SectionOption {
  id: string;
  departmentId: string;
  name: string;
}
export interface DesignationOption {
  id: string;
  title: string;
}

export const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'] as const;
export const EMPLOYEE_STATUSES = ['ONBOARDING', 'ACTIVE', 'ON_LEAVE', 'OFFBOARDING', 'ALUMNI'] as const;
export const GENDERS = ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'] as const;
export const MARITAL_STATUSES = ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED'] as const;
export const PAY_TYPES = ['MONTHLY', 'ANNUAL', 'HOURLY'] as const;
export const GOAL_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] as const;

export const ALLOWANCE_TYPES = [
  { value: 'HOUSING', label: 'Housing' },
  { value: 'TRANSPORT_VEHICLE', label: 'Transport/Vehicle' },
  { value: 'MEAL_LUNCH', label: 'Meal/Lunch' },
  { value: 'OTHER', label: 'Other' },
] as const;

export function allowanceTypeLabel(type: string): string {
  return ALLOWANCE_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function fmtOrDash(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function toDateInput(iso: string | null | undefined) {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 10);
}

export function personName(p: { firstName: string; lastName: string } | null | undefined) {
  return p ? `${p.firstName} ${p.lastName}` : '—';
}
