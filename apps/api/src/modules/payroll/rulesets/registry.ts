import type { PayrollRuleset } from './payroll-ruleset.interface';
import { nzPayrollRuleset } from './nz-payroll-ruleset';
import { zmPayrollRuleset } from './zm-payroll-ruleset';

/**
 * "Native" tier from the framework doc. Add AU here when it's built
 * (Phase 2 of the roadmap); every other country routes through a
 * "Partnered" ruleset once a payroll partner is integrated (Sheet 07) —
 * this registry is exactly the seam that plugs into.
 */
export const PAYROLL_RULESETS: Record<string, PayrollRuleset> = {
  ZM: zmPayrollRuleset,
  NZ: nzPayrollRuleset,
};
