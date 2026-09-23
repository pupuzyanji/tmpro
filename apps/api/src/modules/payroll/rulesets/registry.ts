import type { PayrollRuleset } from './payroll-ruleset.interface';
import { nzPayrollRuleset } from './nz-payroll-ruleset';
import { zmPayrollRuleset } from './zm-payroll-ruleset';
import { zwPayrollRuleset } from './zw-payroll-ruleset';
import { mwPayrollRuleset } from './mw-payroll-ruleset';
import { zaPayrollRuleset } from './za-payroll-ruleset';
import { tzPayrollRuleset } from './tz-payroll-ruleset';
import { gbPayrollRuleset } from './gb-payroll-ruleset';
import { frPayrollRuleset } from './fr-payroll-ruleset';

/**
 * "Native" tier from the framework doc. Add AU here when it's built
 * (Phase 2 of the roadmap); every other country routes through a
 * "Partnered" ruleset once a payroll partner is integrated (Sheet 07) —
 * this registry is exactly the seam that plugs into.
 *
 * ZW/MW/ZA/TZ/GB/FR are illustrative country-default rulesets, added the
 * same way ZM/NZ were — each carries its own "NOT verified current rates"
 * caveat in its file; confirm against the relevant tax/social-security
 * authority before any real payroll run on one of these.
 */
export const PAYROLL_RULESETS: Record<string, PayrollRuleset> = {
  ZM: zmPayrollRuleset,
  NZ: nzPayrollRuleset,
  ZW: zwPayrollRuleset,
  MW: mwPayrollRuleset,
  ZA: zaPayrollRuleset,
  TZ: tzPayrollRuleset,
  GB: gbPayrollRuleset,
  FR: frPayrollRuleset,
};
