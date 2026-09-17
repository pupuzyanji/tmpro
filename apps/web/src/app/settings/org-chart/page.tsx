'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { Avatar } from '@/components/avatar';
import { IconChevronRight, IconDownload } from '@/components/icons';

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  department: string | null;
  managerId: string | null;
  status: string;
}

export default function OrgChartPage() {
  const { ready, call } = useApi();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ready) return;
    call<Employee[]>('/employees')
      .then(setEmployees)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load the org chart.'));
  }, [ready, call]);

  async function downloadPdf() {
    if (!chartRef.current) return;
    setExporting(true);
    setError(null);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
      const canvas = await html2canvas(chartRef.current, { backgroundColor: '#ffffff', scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      // Landscape page sized to the chart's own aspect ratio so nothing gets
      // cropped, whichever team the chart is — a single node or a wide tree.
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [canvas.width, canvas.height] });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save('org-chart.pdf');
    } catch {
      setError('Could not generate the PDF.');
    } finally {
      setExporting(false);
    }
  }

  const byManager = useMemo(() => {
    const map = new Map<string, Employee[]>();
    for (const e of employees) {
      const key = e.managerId ?? '__root__';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [employees]);

  const roots = useMemo(() => {
    const ids = new Set(employees.map((e) => e.id));
    // A root is anyone with no manager, or whose manager isn't in this tenant's directory.
    return employees.filter((e) => !e.managerId || !ids.has(e.managerId));
  }, [employees]);

  if (error) return <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  if (!employees.length) return <p className="text-sm text-slate-500">No employees to chart yet.</p>;

  return (
    <div className="overflow-x-auto pb-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <p className="text-sm text-slate-500">Schematic view of the organization, built from reporting lines.</p>
        <button className="btn-secondary flex shrink-0 items-center gap-1.5 whitespace-nowrap py-1.5" disabled={exporting} onClick={downloadPdf}>
          <IconDownload />
          {exporting ? 'Preparing PDF…' : 'Download PDF'}
        </button>
      </div>
      <div ref={chartRef} className="inline-block bg-white p-4">
        <div className="flex min-w-max justify-center gap-10 px-4">
          {roots.map((r) => (
            <OrgNode key={r.id} employee={r} byManager={byManager} />
          ))}
        </div>
      </div>
    </div>
  );
}

function OrgNode({ employee, byManager }: { employee: Employee; byManager: Map<string, Employee[]> }) {
  const [open, setOpen] = useState(true);
  const children = byManager.get(employee.id) ?? [];

  return (
    <div className="flex flex-col items-center">
      <div className="card flex w-56 items-center gap-3 !p-3">
        <Avatar name={`${employee.firstName} ${employee.lastName}`} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">
            {employee.firstName} {employee.lastName}
          </p>
          <p className="truncate text-xs text-slate-500">{employee.jobTitle ?? 'No title'}</p>
          {employee.department && <p className="truncate text-[11px] text-slate-400">{employee.department}</p>}
        </div>
        {children.length > 0 && (
          <button
            className={`shrink-0 rounded p-0.5 text-slate-400 transition-transform hover:text-ink ${open ? 'rotate-90' : ''}`}
            onClick={() => setOpen(!open)}
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            <IconChevronRight />
          </button>
        )}
      </div>

      {open && children.length > 0 && (
        <>
          <div className="h-6 w-px bg-slate-300" />
          <div className="relative flex gap-8">
            {children.length > 1 && (
              <div
                className="absolute left-0 right-0 top-0 h-px bg-slate-300"
                style={{ marginLeft: '7rem', marginRight: '7rem' }}
              />
            )}
            {children.map((c) => (
              <div key={c.id} className="flex flex-col items-center">
                <div className="h-6 w-px bg-slate-300" />
                <OrgNode employee={c} byManager={byManager} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
