import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import { withTenant } from '../../db/client';
import { employeeContracts, employees, gratuitySettlements } from '../../db/schema';
import { CONTRACT_TYPES, contractMonths, gratuityFor, settleDueGratuities, STATUTORY_GRATUITY } from './gratuity';

export interface ContractInput {
  contractType?: string;
  startDate?: string;
  endDate?: string | null;
  pensionScheme?: string | null;
  gratuityRate?: number | string | null;
  probationEndDate?: string | null;
  noticePeriodDays?: number | string | null;
  reference?: string | null;
  notes?: string | null;
}

const CATEGORY: Record<string, string> = {
  PERMANENT_PENSIONABLE: 'PERMANENT',
  PERMANENT_NON_PENSIONABLE: 'PERMANENT',
  FIXED_TERM: 'FIXED_TERM',
  TEMPORARY: 'TEMPORARY',
  CASUAL: 'CASUAL',
};

function day(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new BadRequestException(`"${v}" is not a date.`);
  return s;
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** v028.F — the dated employment contract behind the Job tab's Contract
 *  section, and the gratuity it earns (see gratuity.ts). */
@Injectable()
export class ContractsService {
  async list(tenantId: string, employeeId: string) {
    return withTenant(tenantId, async (tx) => {
      const [emp] = await tx.select({ countryCode: employees.countryCode }).from(employees).where(and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId))).limit(1);
      if (!emp) throw new NotFoundException('Employee not found.');
      const rows = await tx
        .select()
        .from(employeeContracts)
        .where(and(eq(employeeContracts.tenantId, tenantId), eq(employeeContracts.employeeId, employeeId)))
        .orderBy(desc(employeeContracts.startDate));
      const gratuity = [];
      for (const c of rows.filter((r) => r.contractType === 'FIXED_TERM')) gratuity.push(await gratuityFor(tx, c, emp.countryCode, today()));
      return { contracts: rows, gratuity, statutoryRate: STATUTORY_GRATUITY[emp.countryCode] ?? null, countryCode: emp.countryCode };
    });
  }

  private async validate(countryCode: string, v: Required<Pick<ContractInput, 'contractType' | 'startDate'>> & ContractInput) {
    if (!CONTRACT_TYPES.includes(v.contractType as never)) throw new BadRequestException('Choose a contract type.');
    const start = day(v.startDate);
    if (!start) throw new BadRequestException('Give the contract a start date.');
    const end = day(v.endDate);
    if (end && end < start) throw new BadRequestException('The end date is before the start date.');
    if ((v.contractType === 'FIXED_TERM' || v.contractType === 'TEMPORARY') && !end) {
      throw new BadRequestException('Fixed-term and temporary contracts need an end date.');
    }
    let rate: number | null = v.gratuityRate === undefined || v.gratuityRate === null || v.gratuityRate === '' ? null : Number(v.gratuityRate);
    if (rate != null && (!Number.isFinite(rate) || rate < 0 || rate > 100)) throw new BadRequestException('The gratuity rate must be a percentage between 0 and 100.');
    if (v.contractType !== 'FIXED_TERM') rate = null;
    const statutory = STATUTORY_GRATUITY[countryCode];
    const len = contractMonths({ startDate: start, endDate: end });
    if (v.contractType === 'FIXED_TERM' && statutory && len != null && len >= 12) {
      if (rate == null) rate = statutory;
      if (rate < statutory) {
        throw new BadRequestException(`A fixed-term contract of 12 months or longer earns gratuity of at least ${statutory}% of basic pay (Employment Code Act s.73).`);
      }
    }
    const notice = v.noticePeriodDays === undefined || v.noticePeriodDays === null || v.noticePeriodDays === '' ? null : Math.round(Number(v.noticePeriodDays));
    return {
      contractType: v.contractType,
      startDate: start,
      endDate: end,
      pensionScheme: v.contractType === 'PERMANENT_PENSIONABLE' ? v.pensionScheme?.trim() || null : null,
      gratuityRate: rate,
      probationEndDate: day(v.probationEndDate),
      noticePeriodDays: notice != null && Number.isFinite(notice) ? notice : null,
      reference: v.reference?.trim() || null,
      notes: v.notes?.trim() || null,
    };
  }

  async add(tenantId: string, employeeId: string, createdBy: string | null, body: ContractInput) {
    return withTenant(tenantId, async (tx) => {
      const [emp] = await tx.select().from(employees).where(and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId))).limit(1);
      if (!emp) throw new NotFoundException('Employee not found.');
      const values = await this.validate(emp.countryCode, { ...body, contractType: body.contractType ?? '', startDate: body.startDate ?? '' });
      const [row] = await tx.insert(employeeContracts).values({ tenantId, employeeId, ...values, createdBy }).returning();
      await this.syncEmployee(tx, tenantId, employeeId);
      return row;
    });
  }

  async update(tenantId: string, employeeId: string, id: string, body: ContractInput) {
    return withTenant(tenantId, async (tx) => {
      const [cur] = await tx.select().from(employeeContracts).where(and(eq(employeeContracts.tenantId, tenantId), eq(employeeContracts.id, id), eq(employeeContracts.employeeId, employeeId))).limit(1);
      if (!cur) throw new NotFoundException('Contract not found.');
      const [paid] = await tx.select({ id: gratuitySettlements.id }).from(gratuitySettlements).where(eq(gratuitySettlements.contractId, id)).limit(1);
      if (paid) throw new BadRequestException('The gratuity for this contract has already been paid, so it can no longer be changed. Add a new contract for any renewal.');
      const [emp] = await tx.select({ countryCode: employees.countryCode }).from(employees).where(eq(employees.id, employeeId)).limit(1);
      const merged = {
        contractType: body.contractType ?? cur.contractType,
        startDate: body.startDate ?? cur.startDate,
        endDate: body.endDate === undefined ? cur.endDate : body.endDate,
        pensionScheme: body.pensionScheme === undefined ? cur.pensionScheme : body.pensionScheme,
        gratuityRate: body.gratuityRate === undefined ? cur.gratuityRate : body.gratuityRate,
        probationEndDate: body.probationEndDate === undefined ? cur.probationEndDate : body.probationEndDate,
        noticePeriodDays: body.noticePeriodDays === undefined ? cur.noticePeriodDays : body.noticePeriodDays,
        reference: body.reference === undefined ? cur.reference : body.reference,
        notes: body.notes === undefined ? cur.notes : body.notes,
      };
      const values = await this.validate(emp.countryCode, merged);
      const [row] = await tx.update(employeeContracts).set(values).where(eq(employeeContracts.id, id)).returning();
      await this.syncEmployee(tx, tenantId, employeeId);
      return row;
    });
  }

  async remove(tenantId: string, employeeId: string, id: string) {
    return withTenant(tenantId, async (tx) => {
      const [paid] = await tx.select({ id: gratuitySettlements.id }).from(gratuitySettlements).where(eq(gratuitySettlements.contractId, id)).limit(1);
      if (paid) throw new BadRequestException('The gratuity for this contract has already been paid, so it can’t be deleted.');
      const [row] = await tx
        .delete(employeeContracts)
        .where(and(eq(employeeContracts.tenantId, tenantId), eq(employeeContracts.id, id), eq(employeeContracts.employeeId, employeeId)))
        .returning({ id: employeeContracts.id });
      if (!row) throw new NotFoundException('Contract not found.');
      await this.syncEmployee(tx, tenantId, employeeId);
      return { ok: true };
    });
  }

  /** Keeps the employee's leave-rule fields in step with the contract in
   *  force today (or the earliest one, before it starts). */
  private async syncEmployee(tx: any, tenantId: string, employeeId: string) {
    const rows = await tx
      .select()
      .from(employeeContracts)
      .where(and(eq(employeeContracts.tenantId, tenantId), eq(employeeContracts.employeeId, employeeId)))
      .orderBy(asc(employeeContracts.startDate));
    const now = today();
    const cur = rows.filter((r: typeof employeeContracts.$inferSelect) => r.startDate <= now).at(-1) ?? rows[0];
    if (!cur) return;
    const len = contractMonths(cur);
    const term = cur.contractType.startsWith('PERMANENT') ? 'LONG' : cur.contractType === 'CASUAL' || (len != null && len <= 12) ? 'SHORT' : 'LONG';
    await tx
      .update(employees)
      .set({ employmentCategory: CATEGORY[cur.contractType], contractTerm: term, contractEndDate: cur.endDate })
      .where(and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId)));
  }

  /** Reports → Gratuity liability: accrued, unpaid gratuity on every running
   *  fixed-term contract, plus what is due now. */
  async liability(tenantId: string) {
    return withTenant(tenantId, async (tx) => {
      await settleDueGratuities(tx, tenantId, today());
      const rows = await tx
        .select({ c: employeeContracts, e: employees })
        .from(employeeContracts)
        .innerJoin(employees, eq(employees.id, employeeContracts.employeeId))
        .where(and(eq(employeeContracts.tenantId, tenantId), eq(employeeContracts.contractType, 'FIXED_TERM'), ne(employees.status, 'ALUMNI')));
      const out = [];
      for (const { c, e } of rows) {
        const g = await gratuityFor(tx, c, e.countryCode, today());
        if (!g.eligible || g.settled) continue;
        out.push({
          employeeId: e.id,
          name: `${e.firstName} ${e.lastName}`,
          department: e.department,
          countryCode: e.countryCode,
          contractEnds: c.endDate,
          rate: g.rate,
          months: g.months,
          basicMonthly: g.basicMonthly,
          accrued: g.amount,
          taxFree: g.taxFree,
          taxable: g.taxable,
        });
      }
      out.sort((a, b) => b.accrued - a.accrued);
      const total = Math.round(out.reduce((s, r) => s + r.accrued, 0) * 100) / 100;
      return { asOf: today(), total, rows: out };
    });
  }

  /** v029.B — contracts that end within the next `months` months (or have
   *  already ended while the person is still on the books), for the
   *  dashboard. Only each person's latest contract counts, so a renewed
   *  contract drops off the list. */
  async expiring(tenantId: string, months = 6) {
    const asOf = today();
    const d = new Date(`${asOf}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + months);
    const until = d.toISOString().slice(0, 10);
    return withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select({ c: employeeContracts, e: employees })
        .from(employeeContracts)
        .innerJoin(employees, eq(employees.id, employeeContracts.employeeId))
        .where(and(eq(employeeContracts.tenantId, tenantId), ne(employees.status, 'ALUMNI')))
        .orderBy(asc(employeeContracts.startDate));
      const latest = new Map<string, (typeof rows)[number]>();
      for (const r of rows) latest.set(r.e.id, r);
      const out = [];
      for (const { c, e } of latest.values()) {
        if (!c.endDate || c.endDate > until) continue;
        const g = c.contractType === 'FIXED_TERM' ? await gratuityFor(tx, c, e.countryCode, c.endDate < asOf ? c.endDate : asOf) : null;
        const daysLeft = Math.round((Date.parse(c.endDate) - Date.parse(asOf)) / 86_400_000);
        out.push({
          contractId: c.id,
          employeeId: e.id,
          name: `${e.firstName} ${e.lastName}`,
          photoUrl: e.photoThumb ?? e.photoUrl,
          jobTitle: e.jobTitle,
          department: e.department,
          countryCode: e.countryCode,
          contractType: c.contractType,
          startDate: c.startDate,
          endDate: c.endDate,
          daysLeft,
          noticePeriodDays: c.noticePeriodDays,
          gratuity: g && g.eligible && !g.settled ? { rate: g.rate, accrued: g.amount } : null,
        });
      }
      out.sort((a, b) => a.endDate!.localeCompare(b.endDate!));
      return { asOf, until, months, rows: out };
    });
  }
}
