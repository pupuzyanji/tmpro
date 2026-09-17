'use client';

import { useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { IconUpload, IconDownload } from '@/components/icons';

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

/** One column of the downloadable sample CSV: the header exactly as the
 *  import parser expects it, plus one example value for the sample row. */
export interface SampleCsvColumn {
  header: string;
  example: string;
}

function downloadSampleCsv(fileName: string, columns: SampleCsvColumn[]) {
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = `${columns.map((c) => escape(c.header)).join(',')}\n${columns.map((c) => escape(c.example)).join(',')}\n`;
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

/** "Data Import" affordance shared by every Settings tab — Branches,
 *  Departments, Sections, Designations, Employees each point this at their
 *  own `/settings/.../import` (or `/employees/import`) endpoint. When
 *  `sampleColumns` is given, a "Sample CSV" link sits next to the import
 *  button and downloads a template with the exact headers the parser
 *  expects, pre-filled with one example row. */
export function CsvImportButton({
  endpoint,
  onDone,
  sampleColumns,
  sampleFileName,
}: {
  endpoint: string;
  onDone: () => void;
  sampleColumns?: SampleCsvColumn[];
  sampleFileName?: string;
}) {
  const { upload } = useApi();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await upload<ImportResult>(endpoint, file);
      setResult(res);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not import that file.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="relative flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <button className="btn-secondary flex items-center gap-1.5 whitespace-nowrap py-1.5" disabled={busy} onClick={() => inputRef.current?.click()}>
        <IconUpload />
        {busy ? 'Importing…' : 'Data Import (CSV)'}
      </button>
      {sampleColumns && sampleColumns.length > 0 && (
        <button
          type="button"
          className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-brand-blue hover:underline"
          onClick={() => downloadSampleCsv(sampleFileName ?? 'sample-import.csv', sampleColumns)}
          title="Download a sample CSV with the expected columns"
        >
          <IconDownload />
          Sample CSV
        </button>
      )}

      {(result || error) && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg">
          {error && <p className="text-red-600">{error}</p>}
          {result && (
            <div className="space-y-1">
              <p className="font-medium text-ink">
                Imported {result.imported}, skipped {result.skipped}.
              </p>
              {result.errors.length > 0 && (
                <ul className="max-h-32 space-y-0.5 overflow-y-auto text-slate-500">
                  {result.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <button className="mt-2 text-brand-blue" onClick={() => { setResult(null); setError(null); }}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
