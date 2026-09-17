// Small client-side CSV builder/downloader shared by the Regulatory
// Submission exports (Superannuation/PAYE/Health Insurance Return files) and
// anywhere else a table needs to leave the browser as a .csv — same
// escape+Blob+temporary-<a>-download approach as the Settings "Sample CSV"
// downloads (see components/csv-import-button.tsx), generalized to arbitrary
// rows instead of one fixed sample row.

function escapeCsvValue(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Builds a CSV string from a header row plus an array of row-arrays (same
 *  column order as `headers`). */
export function buildCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvValue).join(','));
  return lines.join('\n') + '\n';
}

/** Builds the CSV and triggers a browser download for it. */
export function downloadCsv(fileName: string, headers: string[], rows: (string | number)[][]) {
  const csv = buildCsv(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
