import { Injectable } from '@nestjs/common';
import { and, eq, gte, lte } from 'drizzle-orm';
import { withTenant } from '../../db/client';
import {
  employeeDocuments,
  employees,
  goals,
  leaveBalances,
  leaveRequests,
  performanceReviewEntries,
} from '../../db/schema';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

export interface DateRange {
  from?: string;
  to?: string;
}

/** Every report scopes to the caller: Admin sees the whole tenant, a
 *  Supervisor sees only their direct reports (same visibility rule used
 *  everywhere else in the app — People, Documents, Leave approvals). */
@Injectable()
export class ReportsService {
  private async scopeEmployeeIds(tenantId: string, user: AuthenticatedUser): Promise<Set<string> | null> {
    // null = no restriction (Admin/HR: every employee in the tenant).
    if (user.role === 'ADMIN' || user.role === 'HR') return null;
    return withTenant(tenantId, async (tx) => {
      const reports = await tx
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.managerId, user.employeeId ?? '')));
      return new Set(reports.map((r) => r.id));
    });
  }

  private inScope(scope: Set<string> | null, employeeId: string): boolean {
    return scope === null || scope.has(employeeId);
  }

  private dateFilters(range: DateRange, column: any) {
    const clauses = [];
    if (range.from) clauses.push(gte(column, new Date(range.from)));
    if (range.to) clauses.push(lte(column, new Date(range.to)));
    return clauses;
  }

  /** Leave days taken within the date range (sum of APPROVED requests whose
   *  start date falls in range), alongside each employee's current remaining
   *  balance total, per employee. */
  async leaveAccumulated(tenantId: string, user: AuthenticatedUser, range: DateRange) {
    const scope = await this.scopeEmployeeIds(tenantId, user);
    return withTenant(tenantId, async (tx) => {
      // Sequential — these share one transaction's client connection, which
      // node-postgres can't run overlapping queries on.
      const allEmployees = await tx.select().from(employees).where(eq(employees.tenantId, tenantId));
      const requests = await tx.query.leaveRequests.findMany({
        where: and(
          eq(leaveRequests.tenantId, tenantId),
          eq(leaveRequests.status, 'APPROVED'),
          ...this.dateFilters(range, leaveRequests.startDate),
        ),
        with: { leaveType: true },
      });
      const balances = await tx.select().from(leaveBalances).where(eq(leaveBalances.tenantId, tenantId));
      return allEmployees
        .filter((e) => this.inScope(scope, e.id))
        .map((e) => {
          const taken = requests.filter((r) => r.employeeId === e.id).reduce((sum, r) => sum + r.days, 0);
          const remaining = balances.filter((b) => b.employeeId === e.id).reduce((sum, b) => sum + b.balanceDays, 0);
          return {
            employeeId: e.id,
            name: `${e.firstName} ${e.lastName}`,
            daysTakenInRange: taken,
            currentBalance: remaining,
          };
        })
        .sort((a, b) => b.daysTakenInRange - a.daysTakenInRange);
    });
  }

  /** Performance goals created within the date range, per employee. */
  async goalsSet(tenantId: string, user: AuthenticatedUser, range: DateRange) {
    const scope = await this.scopeEmployeeIds(tenantId, user);
    return withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select({
          employeeId: goals.employeeId,
          title: goals.title,
          firstName: employees.firstName,
          lastName: employees.lastName,
        })
        .from(goals)
        .innerJoin(employees, eq(goals.employeeId, employees.id))
        .where(and(eq(goals.tenantId, tenantId), ...this.dateFilters(range, goals.createdAt)));
      const byEmployee = new Map<string, { employeeId: string; name: string; goalsSet: number; titles: string[] }>();
      for (const g of rows) {
        if (!this.inScope(scope, g.employeeId)) continue;
        const key = g.employeeId;
        if (!byEmployee.has(key)) {
          byEmployee.set(key, { employeeId: key, name: `${g.firstName} ${g.lastName}`, goalsSet: 0, titles: [] });
        }
        const entry = byEmployee.get(key)!;
        entry.goalsSet += 1;
        if (entry.titles.length < 5) entry.titles.push(g.title);
      }
      return [...byEmployee.values()].sort((a, b) => b.goalsSet - a.goalsSet);
    });
  }

  /** Scored performance-review entries ("Performance Reviews" table on the
   *  People profile — review cycles/formal appraisals aren't wired up
   *  anywhere in this build yet, so this ad-hoc review log is the closest
   *  real "appraisal conducted" record). */
  async appraisalsConducted(tenantId: string, user: AuthenticatedUser, range: DateRange) {
    const scope = await this.scopeEmployeeIds(tenantId, user);
    return withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select({
          employeeId: performanceReviewEntries.employeeId,
          date: performanceReviewEntries.date,
          firstName: employees.firstName,
          lastName: employees.lastName,
        })
        .from(performanceReviewEntries)
        .innerJoin(employees, eq(performanceReviewEntries.employeeId, employees.id))
        .where(
          and(eq(performanceReviewEntries.tenantId, tenantId), ...this.dateFilters(range, performanceReviewEntries.date)),
        );
      const byEmployee = new Map<string, { employeeId: string; name: string; appraisalsConducted: number; lastDate: Date }>();
      for (const r of rows) {
        if (!this.inScope(scope, r.employeeId)) continue;
        const key = r.employeeId;
        if (!byEmployee.has(key)) {
          byEmployee.set(key, {
            employeeId: key,
            name: `${r.firstName} ${r.lastName}`,
            appraisalsConducted: 0,
            lastDate: r.date,
          });
        }
        const entry = byEmployee.get(key)!;
        entry.appraisalsConducted += 1;
        if (r.date > entry.lastDate) entry.lastDate = r.date;
      }
      return [...byEmployee.values()].sort((a, b) => b.appraisalsConducted - a.appraisalsConducted);
    });
  }

  /** Pending (unresponded) leave requests grouped by the requesting
   *  employee's supervisor — an org-wide breakdown, so Admin-only. */
  async unrespondedRequestsBySupervisor(tenantId: string, range: DateRange) {
    return withTenant(tenantId, async (tx) => {
      // Sequential — same-transaction client, see leaveAccumulated above.
      const pending = await tx.query.leaveRequests.findMany({
        where: and(
          eq(leaveRequests.tenantId, tenantId),
          eq(leaveRequests.status, 'PENDING'),
          ...this.dateFilters(range, leaveRequests.createdAt),
        ),
        with: { employee: true },
      });
      const allEmployees = await tx.select().from(employees).where(eq(employees.tenantId, tenantId));
      const byId = new Map(allEmployees.map((e) => [e.id, e]));
      const bySupervisor = new Map<string, { supervisorId: string | null; supervisorName: string; unresponded: number }>();
      for (const r of pending) {
        const managerId = r.employee.managerId;
        const manager = managerId ? byId.get(managerId) : null;
        const key = managerId ?? 'unassigned';
        if (!bySupervisor.has(key)) {
          bySupervisor.set(key, {
            supervisorId: managerId,
            supervisorName: manager ? `${manager.firstName} ${manager.lastName}` : 'No supervisor assigned',
            unresponded: 0,
          });
        }
        bySupervisor.get(key)!.unresponded += 1;
      }
      return [...bySupervisor.values()].sort((a, b) => b.unresponded - a.unresponded);
    });
  }

  /** Employees with no document on file in the given category — filtered by
   *  hire date range, since "contract/ID copies not on file" has no date of
   *  its own to range over. */
  private async missingDocuments(
    tenantId: string,
    user: AuthenticatedUser,
    range: DateRange,
    category: 'CONTRACT' | 'ID',
  ) {
    const scope = await this.scopeEmployeeIds(tenantId, user);
    return withTenant(tenantId, async (tx) => {
      // Sequential — same-transaction client, see leaveAccumulated above.
      const allEmployees = await tx
        .select()
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), ...this.dateFilters(range, employees.startDate)));
      const docs = await tx
        .select({ employeeId: employeeDocuments.employeeId })
        .from(employeeDocuments)
        .where(and(eq(employeeDocuments.tenantId, tenantId), eq(employeeDocuments.category, category)));
      const haveIt = new Set(docs.map((d) => d.employeeId));
      return allEmployees
        .filter((e) => this.inScope(scope, e.id) && !haveIt.has(e.id))
        .map((e) => ({
          employeeId: e.id,
          name: `${e.firstName} ${e.lastName}`,
          jobTitle: e.jobTitle,
          startDate: e.startDate,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  contractsMissing(tenantId: string, user: AuthenticatedUser, range: DateRange) {
    return this.missingDocuments(tenantId, user, range, 'CONTRACT');
  }

  idsMissing(tenantId: string, user: AuthenticatedUser, range: DateRange) {
    return this.missingDocuments(tenantId, user, range, 'ID');
  }
}
