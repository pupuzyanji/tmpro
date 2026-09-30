// v028.A — opening balances when an organisation moves onto tmPro.
//
// Semantics: a posted line says "at the cut-over date, this person's
// balance WAS X" (or "had already USED U of this period's allowance"). The
// engine posts whatever difference makes the ledger agree with that figure
// at the cut-over, and stops accruing anything on or before it — so the
// result is the same whether or not tmPro had already been computing
// accruals for that person.

import { and, asc, eq, inArray, lte } from 'drizzle-orm';

import {
  employees,
  leaveLedger,
  leaveOpeningBatches,
  leaveOpeningLines,
  sickLeaveEpisodes,
} from '../../../db/schema';
import { parseCsv } from '../../../common/csv/csv-import.util';
import { loadEmployeeCtx, loadSettings, policiesFor, policyOn, Tx, typesForRegime } from './context';
import { ISODate, round2, today } from './dates';
import { balance, cycleKeyFor, post, reversedIds } from './ledger';
import { processEmployee } from './process';

export const OPENING_COLUMNS = [
  'employee_code',
  'employee_name',
  'leave_code',
  'balance',
  'used_this_cycle',
  'sick_full_pay_used',
  'sick_half_pay_used',
  'sick_episode_start',
  'service_from',
  'note',
];

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A pre-filled template: one row per active employee × leave type that has a balance to bring forward. */
export async function openingTemplate(tx: Tx, tenantId: string, regime: string): Promise<string> {
  const types = (await typesForRegime(tx, tenantId, regime)).filter((t) => ['ACCRUING', 'ALLOWANCE', 'EPISODE'].includes(t.kind));
  const emps = await tx
    .select()
    .from(employees)
    .where(and(eq(employees.tenantId, tenantId), inArray(employees.status, ['ACTIVE', 'ONBOARDING', 'ON_LEAVE', 'OFFBOARDING'])))
    .orderBy(asc(employees.lastName));
  const lines = [OPENING_COLUMNS.join(',')];
  for (const e of emps) {
    const empRegime = e.countryCode === regime ? regime : null;
    if (!empRegime && regime !== 'OTHER') continue;
    for (const t of types) {
      if (t.genderRestriction !== 'ANY' && t.genderRestriction !== e.gender) continue;
      lines.push(
        [e.employeeCode ?? '', `${e.firstName} ${e.lastName}`, t.code, '', '', '', '', '', e.continuousServiceFrom ?? '', ''].map(csvCell).join(','),
      );
    }
  }
  return lines.join('\r\n') + '\r\n';
}

function num(v: string | undefined, field: string, errors: string[]): number | null {
  if (v == null || v.trim() === '') return null;
  const n = Number(v.replace(/,/g, ''));
  if (!Number.isFinite(n)) {
    errors.push(`${field} "${v}" is not a number`);
    return null;
  }
  return n;
}

function dateCell(v: string | undefined, field: string, errors: string[]): ISODate | null {
  if (!v || v.trim() === '') return null;
  const s = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    errors.push(`${field} must be YYYY-MM-DD`);
    return null;
  }
  return s;
}

/** Parses and validates an upload into a DRAFT batch. */
export async function createBatch(
  tx: Tx,
  tenantId: string,
  regime: string,
  cutoverDate: ISODate,
  fileName: string,
  buffer: Buffer,
  userId: string,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoverDate)) throw new Error('Choose the cut-over date.');
  if (cutoverDate > today()) throw new Error('The cut-over date cannot be in the future.');
  const rows = parseCsv(buffer);
  const types = await typesForRegime(tx, tenantId, regime);
  const typeByCode = new Map(types.map((t) => [t.code, t]));
  const emps = await tx.select().from(employees).where(eq(employees.tenantId, tenantId));
  const empByCode = new Map(emps.filter((e) => e.employeeCode).map((e) => [e.employeeCode!.trim().toLowerCase(), e]));
  const empByName = new Map(emps.map((e) => [`${e.firstName} ${e.lastName}`.trim().toLowerCase(), e]));

  const [batch] = await tx
    .insert(leaveOpeningBatches)
    .values({ tenantId, countryCode: regime, cutoverDate, fileName, uploadedBy: userId })
    .returning();

  let lineCount = 0;
  let errorCount = 0;
  const seen = new Set<string>();
  let rowNumber = 1;
  for (const r of rows) {
    rowNumber++;
    const errors: string[] = [];
    const code = (r.employee_code ?? '').trim();
    const name = (r.employee_name ?? '').trim();
    const emp = (code && empByCode.get(code.toLowerCase())) || (!code && name && empByName.get(name.toLowerCase())) || null;
    if (!emp) errors.push(code ? `No employee with code "${code}"` : `No employee named "${name}" (add employee_code to be exact)`);
    const leaveCode = (r.leave_code ?? '').trim().toUpperCase();
    const type = typeByCode.get(leaveCode);
    if (!type) errors.push(`Unknown leave_code "${leaveCode}" for this country`);
    const bal = num(r.balance, 'balance', errors);
    const used = num(r.used_this_cycle, 'used_this_cycle', errors);
    const sickFull = num(r.sick_full_pay_used, 'sick_full_pay_used', errors);
    const sickHalf = num(r.sick_half_pay_used, 'sick_half_pay_used', errors);
    const sickStart = dateCell(r.sick_episode_start, 'sick_episode_start', errors);
    const serviceFrom = dateCell(r.service_from, 'service_from', errors);
    if (type && emp) {
      if (emp.countryCode !== regime && regime !== 'OTHER') errors.push(`${emp.firstName} ${emp.lastName} is not employed in ${regime}`);
      if (type.kind === 'ACCRUING' && bal == null) errors.push('balance is required for this leave type');
      if (type.kind === 'ALLOWANCE' && used == null) errors.push('used_this_cycle is required for this leave type');
      if (type.kind === 'ALLOWANCE' && used != null && used < 0) errors.push('used_this_cycle cannot be negative');
      if (type.kind === 'EPISODE' && sickFull == null && sickHalf == null) errors.push('give sick_full_pay_used and/or sick_half_pay_used (or delete this row)');
      if (['EVENT', 'UNTRACKED'].includes(type.kind)) errors.push(`${type.name} has no balance to bring forward`);
      if (bal != null && Math.abs(bal) > 1000) errors.push('balance looks too large — check the figure');
      const key = `${emp.id}:${type.id}`;
      if (seen.has(key)) errors.push('duplicate row for this employee and leave type');
      seen.add(key);
    }
    // Rows left completely blank in the template are simply skipped.
    const blank = bal == null && used == null && sickFull == null && sickHalf == null && !serviceFrom;
    if (blank && emp && type) continue;
    lineCount++;
    if (errors.length) errorCount++;
    await tx.insert(leaveOpeningLines).values({
      tenantId,
      batchId: batch.id,
      rowNumber,
      employeeId: emp?.id ?? null,
      employeeCode: code || null,
      leaveTypeId: type?.id ?? null,
      leaveCode: leaveCode || null,
      balance: bal,
      usedThisCycle: used,
      sickFullUsed: sickFull,
      sickHalfUsed: sickHalf,
      sickEpisodeStart: sickStart,
      serviceFrom,
      note: (r.note ?? '').trim() || null,
      errors,
    });
  }
  await tx.update(leaveOpeningBatches).set({ lineCount, errorCount }).where(eq(leaveOpeningBatches.id, batch.id));
  return { ...batch, lineCount, errorCount };
}

export async function postBatch(tx: Tx, tenantId: string, batchId: string, userId: string) {
  const [batch] = await tx
    .select()
    .from(leaveOpeningBatches)
    .where(and(eq(leaveOpeningBatches.tenantId, tenantId), eq(leaveOpeningBatches.id, batchId)))
    .limit(1);
  if (!batch) throw new Error('Batch not found.');
  if (batch.status !== 'DRAFT') throw new Error(`This batch is already ${batch.status.toLowerCase()}.`);
  if (batch.errorCount > 0) throw new Error('Fix the rows with errors and upload again before posting.');
  const lines = await tx.select().from(leaveOpeningLines).where(eq(leaveOpeningLines.batchId, batchId)).orderBy(asc(leaveOpeningLines.rowNumber));
  const settings = await loadSettings(tx, tenantId);
  const cut = batch.cutoverDate;

  // Service dates first — they change cycles and eligibility.
  for (const l of lines) {
    if (l.serviceFrom && l.employeeId) {
      await tx.update(employees).set({ continuousServiceFrom: l.serviceFrom }).where(and(eq(employees.tenantId, tenantId), eq(employees.id, l.employeeId)));
    }
  }

  for (const l of lines) {
    if (!l.employeeId || !l.leaveTypeId) continue;
    const emp = await loadEmployeeCtx(tx, tenantId, l.employeeId, today());
    if (!emp) continue;
    const types = await typesForRegime(tx, tenantId, emp.regime);
    const type = types.find((t) => t.id === l.leaveTypeId);
    if (!type) continue;
    const versions = (await policiesFor(tx, tenantId, [type.id])).get(type.id) ?? [];
    const policy = policyOn(versions, cut);
    const base = { tenantId, employeeId: emp.id, leaveTypeId: type.id, policyId: policy?.id ?? null, sourceType: 'OPENING_BATCH' as const, sourceId: batch.id, createdBy: userId };
    const note = l.note ? `Opening balance — ${l.note}` : `Opening balance at cut-over ${cut}`;

    if (type.kind === 'ACCRUING' && l.balance != null) {
      const current = await balance(tx, tenantId, emp.id, type.id, cut);
      await post(tx, {
        ...base,
        entryType: 'OPENING_BALANCE',
        units: round2(l.balance - current),
        effectiveDate: cut,
        cycleKey: cycleKeyFor('EMPLOYMENT_ANNIVERSARY', cut, emp.serviceStart),
        idemKey: `OPEN:${batch.id}:${l.id}`,
        note: `${note} (balance set to ${l.balance})`,
      });
    } else if (type.kind === 'ALLOWANCE' && l.usedThisCycle != null && policy) {
      // Make sure this period's allotment exists before recording usage against it.
      await processEmployee(tx, emp, today(), settings);
      const cycleKey = cycleKeyFor(policy.cycle, cut, emp.serviceStart);
      // Target: remaining at the cut-over = allotted − used. Post whatever
      // difference gets the ledger there (handles earlier/reversed batches).
      const rows = await tx
        .select({ entryType: leaveLedger.entryType, units: leaveLedger.units })
        .from(leaveLedger)
        .where(
          and(
            eq(leaveLedger.tenantId, tenantId),
            eq(leaveLedger.employeeId, emp.id),
            eq(leaveLedger.leaveTypeId, type.id),
            eq(leaveLedger.cycleKey, cycleKey),
            lte(leaveLedger.effectiveDate, cut),
          ),
        );
      const allotted = rows.filter((r) => r.entryType === 'ALLOTMENT').reduce((s, r) => s + Number(r.units), 0);
      const current = rows.reduce((s, r) => s + Number(r.units), 0);
      const target = allotted - l.usedThisCycle;
      await post(tx, {
        ...base,
        entryType: 'OPENING_USAGE',
        units: round2(target - current),
        effectiveDate: cut,
        cycleKey,
        idemKey: `OPEN:${batch.id}:${l.id}`,
        note: `${note} (${l.usedThisCycle} already used this period)`,
      });
    } else if (type.kind === 'EPISODE') {
      const full = Number(l.sickFullUsed ?? 0);
      const half = Number(l.sickHalfUsed ?? 0);
      const [ep] = await tx
        .insert(sickLeaveEpisodes)
        .values({
          tenantId,
          employeeId: emp.id,
          startedOn: l.sickEpisodeStart ?? cut,
          lastDay: cut,
          fullPayUsed: full,
          halfPayUsed: half,
          openingBatchId: batch.id,
        })
        .returning();
      for (const [tier, units] of [['FULL', full], ['HALF', half]] as const) {
        if (units > 0) {
          await post(tx, {
            ...base,
            entryType: 'OPENING_USAGE',
            units: -units,
            effectiveDate: cut,
            cycleKey: `E${ep.id}`,
            payTier: tier,
            idemKey: `OPEN:${batch.id}:${l.id}:${tier}`,
            note: `${note} (open sick episode brought forward)`,
          });
        }
      }
    }
  }
  await tx.update(leaveOpeningBatches).set({ status: 'POSTED', postedBy: userId, postedAt: new Date() }).where(eq(leaveOpeningBatches.id, batchId));
}

export async function reverseBatch(tx: Tx, tenantId: string, batchId: string, userId: string) {
  const [batch] = await tx
    .select()
    .from(leaveOpeningBatches)
    .where(and(eq(leaveOpeningBatches.tenantId, tenantId), eq(leaveOpeningBatches.id, batchId)))
    .limit(1);
  if (!batch) throw new Error('Batch not found.');
  if (batch.status !== 'POSTED') throw new Error('Only a posted batch can be reversed.');
  const entries = await tx
    .select()
    .from(leaveLedger)
    .where(and(eq(leaveLedger.tenantId, tenantId), eq(leaveLedger.sourceType, 'OPENING_BATCH'), eq(leaveLedger.sourceId, batchId)));
  const already = await reversedIds(tx, entries.map((e) => e.id));
  for (const e of entries) {
    if (already.has(e.id)) continue;
    await post(tx, {
      tenantId,
      employeeId: e.employeeId,
      leaveTypeId: e.leaveTypeId,
      policyId: e.policyId,
      // Usage-type entries are reversed as usage, so "used" figures stay right.
      entryType: e.entryType === 'OPENING_USAGE' ? 'USAGE_REVERSAL' : 'ADJUSTMENT_REVERSAL',
      units: -Number(e.units),
      effectiveDate: e.effectiveDate,
      cycleKey: e.cycleKey,
      payTier: e.payTier,
      sourceType: 'OPENING_BATCH',
      sourceId: batchId,
      reasonCode: 'OPENING_REVERSED',
      reversesId: e.id,
      note: 'Opening balance batch reversed',
      createdBy: userId,
    });
  }
  await tx
    .update(sickLeaveEpisodes)
    .set({ status: 'CLOSED', fullPayUsed: 0, halfPayUsed: 0 })
    .where(and(eq(sickLeaveEpisodes.tenantId, tenantId), eq(sickLeaveEpisodes.openingBatchId, batchId)));
  await tx.update(leaveOpeningBatches).set({ status: 'REVERSED', reversedAt: new Date() }).where(eq(leaveOpeningBatches.id, batchId));
}

