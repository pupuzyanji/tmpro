import { BadRequestException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';

/** Parses an uploaded CSV buffer into plain row objects keyed by header.
 *  Shared by every Settings "Data Import" endpoint (Branches, Departments,
 *  Designations, Employees, ...) so each one only has to describe how to
 *  map its own columns, not how to read a CSV. */
export function parseCsv(buffer: Buffer): Record<string, string>[] {
  try {
    const rows = parse(buffer, {
      columns: (header: string[]) => header.map((h) => h.trim()),
      skip_empty_lines: true,
      trim: true,
    });
    return rows as Record<string, string>[];
  } catch (err) {
    throw new BadRequestException(`Could not parse CSV file: ${(err as Error).message}`);
  }
}

export interface CsvImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

/** Runs `handler` over every parsed row, collecting a per-row error instead
 *  of failing the whole import — a typo in row 40 shouldn't lose rows 1-39. */
export async function importCsvRows(
  buffer: Buffer,
  handler: (row: Record<string, string>, index: number) => Promise<void>,
): Promise<CsvImportResult> {
  const rows = parseCsv(buffer);
  const result: CsvImportResult = { imported: 0, skipped: 0, errors: [] };
  for (let i = 0; i < rows.length; i++) {
    try {
      await handler(rows[i], i);
      result.imported++;
    } catch (err) {
      result.skipped++;
      result.errors.push(`Row ${i + 2}: ${(err as Error).message}`);
    }
  }
  return result;
}
