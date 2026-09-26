import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { zipSync, strToU8 } from 'fflate';
import { db, withTenant } from '../../db/client';
import { tenants } from '../../db/schema';

// v027.A — Settings → Organization → "Export all data" (Admin only).
// One ZIP with a CSV per table holding this organisation's rows, plus every
// uploaded file (photos, documents, CVs…) extracted as a real file. Tables
// are discovered from the database (every table with a tenant_id column),
// so new tables are included automatically.

// Secrets that never leave the database, even for the organisation's Admin.
const REDACTED_COLUMNS: Record<string, string[]> = {
  users: ['password_hash', 'reset_token_hash', 'reset_token_expires_at'],
};
// Platform-internal tables that hold no customer data.
const SKIP_TABLES = new Set(['billing_events', '_migrations']);

const EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'text/csv': 'csv',
};

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else if (typeof v === 'object') s = JSON.stringify(v);
  else s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

@Injectable()
export class DataExportService {
  async buildExport(tenantId: string): Promise<{ filename: string; zip: Uint8Array; tables: number; files: number }> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);

    const tableRows = await db.execute<{ table_name: string }>(sql`
      SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
      WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'
      ORDER BY c.table_name`);
    const tables = tableRows.rows.map((r) => r.table_name).filter((t) => !SKIP_TABLES.has(t));

    const entries: Record<string, Uint8Array> = {};
    const summary: string[] = [];
    let fileCount = 0;

    await withTenant(tenantId, async (tx) => {
      for (const table of tables) {
        const res = await tx.execute<Record<string, unknown>>(
          sql`SELECT * FROM ${sql.identifier(table)} WHERE tenant_id = ${tenantId}`,
        );
        const redact = new Set(REDACTED_COLUMNS[table] ?? []);
        const columns = res.fields.map((f) => f.name).filter((c) => !redact.has(c));
        const lines = [columns.join(',')];

        res.rows.forEach((row, i) => {
          const rowId = String(row.id ?? i + 1);
          const cells = columns.map((col) => {
            const v = row[col];
            // Uploaded files are stored as data URIs — write them out as
            // files and put the file's path in the CSV instead.
            if (typeof v === 'string' && v.startsWith('data:') && v.includes(';base64,')) {
              const [meta, b64] = v.split(';base64,');
              const mime = meta.slice(5).toLowerCase();
              const ext = EXT[mime] ?? 'bin';
              const path = `files/${table}/${rowId}_${col}.${ext}`;
              entries[path] = new Uint8Array(Buffer.from(b64, 'base64'));
              fileCount++;
              return csvCell(path);
            }
            return csvCell(v);
          });
          lines.push(cells.join(','));
        });

        entries[`${table}.csv`] = strToU8('﻿' + lines.join('\r\n') + '\r\n');
        summary.push(`${table}.csv — ${res.rows.length} row${res.rows.length === 1 ? '' : 's'}`);
      }
    });

    const org = tenant
      ? {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          plan: tenant.plan,
          band: tenant.band,
          billingStatus: tenant.billingStatus,
          billingEmail: tenant.billingEmail,
          country: tenant.country,
          enabledModules: tenant.enabledModules,
          createdAt: tenant.createdAt,
        }
      : { id: tenantId };
    entries['organisation.json'] = strToU8(JSON.stringify(org, null, 2));

    const exportedAt = new Date().toISOString();
    entries['README.txt'] = strToU8(
      [
        `tmPro data export — ${tenant?.name ?? tenantId}`,
        `Exported ${exportedAt}`,
        '',
        'Each .csv file holds one table of your organisation\'s data (UTF-8, opens in Excel).',
        'Rows link to each other by their id columns (for example employee_id).',
        'Uploaded files (photos, documents, CVs, logos) are in the files/ folder;',
        'the matching CSV cell holds the file\'s path.',
        'Passwords and password-reset tokens are never exported.',
        '',
        ...summary,
        '',
        `${fileCount} uploaded file${fileCount === 1 ? '' : 's'} in files/`,
        '',
        'Questions: us@bitware.app',
      ].join('\r\n'),
    );

    const zip = zipSync(entries, { level: 6 });
    const slug = tenant?.slug ?? 'organisation';
    return { filename: `tmpro-export-${slug}-${exportedAt.slice(0, 10)}.zip`, zip, tables: tables.length, files: fileCount };
  }
}
