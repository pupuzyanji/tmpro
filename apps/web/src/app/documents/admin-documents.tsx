'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { fmt } from '@/lib/format';
import { Avatar } from '@/components/avatar';
import { IconDocument, IconChevronDown } from '@/components/icons';
import { DocumentViewerModal, type DocumentFull } from '@/components/document-viewer-modal';
import { DOCUMENT_TYPES } from '@/lib/document-tags';

type Category = 'CONTRACT' | 'ID' | 'OTHER';

interface AdminDocumentRow {
  id: string;
  category: Category;
  label: string;
  /** The Document Type picked on the Add Document row — every upload has
   *  one now (older, pre-redesign uploads may not). */
  documentType: string | null;
  fileName: string;
  mimeType: string;
  createdAt: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  email: string | null;
}

interface DocumentTypeGroup {
  key: string;
  title: string;
  docs: AdminDocumentRow[];
}

/** A document uploaded before the Document Type field existed has no
 *  `documentType` — fall back to a label derived from its legacy
 *  CONTRACT/ID/OTHER category so it still lands in a sensible group instead
 *  of disappearing from the browser. */
function legacyGroupTitle(category: Category): string {
  if (category === 'CONTRACT') return 'Contracts (legacy)';
  if (category === 'ID') return "Official ID's (legacy)";
  return 'Other Documents (legacy)';
}

/** Documents sidebar item, for Admin/HR — every document on file for the
 *  tenant, across every employee, grouped under expandable Document Type
 *  sections. Only a type with at least one document uploaded gets a
 *  section; expanding one lists who each document belongs to (avatar, name,
 *  designation under the name) with a View action that opens it in the same
 *  in-platform viewer the profile page uses — nothing here is ever a
 *  download link. */
export function AdminDocumentsBrowser() {
  const { call } = useApi();
  const [rows, setRows] = useState<AdminDocumentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [viewing, setViewing] = useState<DocumentFull | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  useEffect(() => {
    call<AdminDocumentRow[]>('/documents')
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load documents.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One section per Document Type that actually has a document uploaded —
  // ordered to match the Add Document dropdown, with any legacy (no
  // Document Type on file) groups trailing after.
  const groups = useMemo<DocumentTypeGroup[]>(() => {
    const byKey = new Map<string, DocumentTypeGroup>();
    for (const row of rows) {
      const key = row.documentType ?? `legacy:${row.category}`;
      const title = row.documentType ?? legacyGroupTitle(row.category);
      let group = byKey.get(key);
      if (!group) {
        group = { key, title, docs: [] };
        byKey.set(key, group);
      }
      group.docs.push(row);
    }
    for (const group of byKey.values()) {
      group.docs.sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
    }
    return Array.from(byKey.values()).sort((a, b) => {
      const ai = DOCUMENT_TYPES.indexOf(a.title as (typeof DOCUMENT_TYPES)[number]);
      const bi = DOCUMENT_TYPES.indexOf(b.title as (typeof DOCUMENT_TYPES)[number]);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.title.localeCompare(b.title);
    });
  }, [rows]);

  async function view(row: AdminDocumentRow) {
    setViewingId(row.id);
    setError(null);
    try {
      const doc = await call<DocumentFull>(`/employees/${row.employeeId}/documents/${row.id}`);
      setViewing(doc);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open document.');
    } finally {
      setViewingId(null);
    }
  }

  if (loading) return null;

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {groups.length === 0 ? (
        <div className="card">
          <p className="text-sm text-slate-400">No documents have been uploaded for this tenant yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group, idx) => {
            const isOpen = expanded[group.key] ?? idx === 0;
            return (
              <div key={group.key} className="card p-0 overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                  onClick={() => setExpanded((e) => ({ ...e, [group.key]: !isOpen }))}
                >
                  <span className="flex items-center gap-2.5 text-sm font-semibold text-ink">
                    <span className="text-slate-400">
                      <IconDocument />
                    </span>
                    {group.title}
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                      {group.docs.length}
                    </span>
                  </span>
                  <span className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                    <IconChevronDown />
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100">
                    <ul className="divide-y divide-slate-100">
                      {group.docs.map((d) => (
                        <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                          <Avatar name={`${d.firstName} ${d.lastName}`} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-ink">
                              {d.firstName} {d.lastName}
                            </p>
                            <p className="truncate text-xs text-slate-400">
                              {d.jobTitle ?? 'No title'}
                              {d.email && ` · ${d.email}`}
                            </p>
                          </div>
                          <div className="hidden min-w-0 flex-1 sm:block">
                            <p className="truncate text-sm text-ink">{d.label}</p>
                            <p className="truncate text-xs text-slate-400">Last updated {fmt(d.createdAt)}</p>
                          </div>
                          <button
                            className="btn-secondary shrink-0 py-1.5 text-xs"
                            disabled={viewingId === d.id}
                            onClick={() => view(d)}
                          >
                            {viewingId === d.id ? 'Opening…' : 'View'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {viewing && <DocumentViewerModal doc={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
