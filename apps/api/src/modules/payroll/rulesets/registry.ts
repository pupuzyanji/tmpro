import type { PayrollRuleset } from './payroll-ruleset.interface';
import { nzPayrollRuleset } from './nz-payroll-ruleset';
import { zmPayrollRuleset } from './zm-payroll-ruleset';
import { zwPayrollRuleset } from './zw-payroll-ruleset';
import { mwPayrollRuleset } from './mw-payroll-ruleset';
import { zaPayrollRuleset } from './za-payroll-ruleset';
import { tzPayrollRuleset } from './tz-payroll-ruleset';
import { gbPayrollRuleset } from './gb-payroll-ruleset';
import { frPayrollRuleset } from './fr-payroll-ruleset';
import { auPayrollRuleset } from './au-payroll-ruleset';

/**
 * "Native" tier from the framework doc; every other country routes through
 * a "Partnered" ruleset once a payroll partner is integrated (Sheet 07) —
 * this registry is exactly the seam that plugs into.
 *
 * v029.A: ZM, MW, NZ, AU, ZA and ZW carry researched current rates (each
 * file states its sources, effective dates and what it leaves out).
 * TZ/GB/FR remain illustrative — confirm against the relevant tax
 * authority before any real payroll run on one of those.
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
  AU: auPayrollRuleset,
};
