'use client';

import { useEffect, useRef, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { fmtOrDash } from './types';
import { IconDocument, IconPencil, IconTrash, IconUpload, IconPlus } from '@/components/icons';
import { DocumentViewerModal, type DocumentFull } from '@/components/document-viewer-modal';
import { DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from '@/lib/document-tags';

const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp,image/gif,image/svg+xml';

interface DocumentMeta {
  id: string;
  label: string;
  /** Null only for a document uploaded before this Document Type field
   *  existed — every new upload always has one. */
  documentType: string | null;
  fileName: string;
  mimeType: string;
  createdAt: string;
}

let rowKeySeq = 0;
interface PendingRow {
  key: number;
  documentType: string;
  file: File | null;
  label: string;
  error: string | null;
  busy: boolean;
}
function newRow(): PendingRow {
  return { key: rowKeySeq++, documentType: '', file: null, label: '', error: null, busy: false };
}

/** Documents tab on the People profile (and the self-service "My Documents"
 *  page) — one Add Document button, each click opening a new row where the
 *  uploader picks a Document Type, uploads a file (2MB max), and can edit
 *  the document's name before saving. Any number of rows can be open at
 *  once. Already-uploaded documents list below, viewable inline (PDFs
 *  render in an iframe, images directly) without leaving the page.
 *  Upload is allowed for Admin/HR or the employee adding to their own
 *  documents; editing (Document Type/name) and deleting are Admin/HR only,
 *  even on your own profile — see EmployeeDocumentsController's
 *  assertCanAdd/assertCanManage split, which these two props mirror. */
export function DocumentsTab({
  employeeId,
  call,
  uploadWithFields,
  canAdd,
  canManage,
}: {
  employeeId: string;
  call: ReturnType<typeof useApi>['call'];
  uploadWithFields: ReturnType<typeof useApi>['uploadWithFields'];
  canAdd: boolean;
  canManage: boolean;
}) {
  const [docs, setDocs] = useState<DocumentMeta[]>([]);
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<DocumentFull | null>(null);
  const [loadingViewId, setLoadingViewId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameType, setRenameType] = useState('');

  function refresh() {
    return call<DocumentMeta[]>(`/employees/${employeeId}/documents`)
      .then(setDocs)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load documents.'));
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  function patchRow(key: number, patch: Partial<PendingRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function removeRow(key: number) {
    setRows((rs) => rs.filter((r) => r.key !== key));
  }

  function pickFile(key: number, file: File) {
    if (file.size > MAX_DOCUMENT_BYTES) {
      patchRow(key, { error: 'That file is larger than 2MB — choose a smaller one.' });
      return;
    }
    patchRow(key, { file, label: file.name.replace(/\.[^.]+$/, ''), error: null });
  }

  async function saveRow(row: PendingRow) {
    if (!row.documentType || !row.file || !row.label.trim()) return;
    patchRow(row.key, { busy: true, error: null });
    try {
      await uploadWithFields(`/employees/${employeeId}/documents`, row.file, {
        documentType: row.documentType,
        label: row.label.trim(),
      });
      removeRow(row.key);
      await refresh();
    } catch (err) {
      patchRow(row.key, { busy: false, error: err instanceof ApiError ? err.message : 'Could not upload document.' });
    }
  }

  async function view(id: string) {
    setLoadingViewId(id);
    setError(null);
    try {
      const doc = await call<DocumentFull>(`/employees/${employeeId}/documents/${id}`);
      setViewing(doc);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open document.');
    } finally {
      setLoadingViewId(null);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await call(`/employees/${employeeId}/documents/${id}`, { method: 'DELETE' });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete document.');
    }
  }

  async function saveEdit(id: string, label: string, documentType: string) {
    setError(null);
    try {
      const body: { label: string; documentType?: string } = { label };
      if (documentType) body.documentType = documentType;
      await call(`/employees/${employeeId}/documents/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update document.');
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink">Documents</h3>
          <p className="text-xs text-slate-400">PDF or image, 2MB max per file.</p>
        </div>
        {canAdd && (
          <button
            type="button"
            className="btn-secondary flex shrink-0 items-center gap-1.5 py-1.5 text-xs"
            onClick={() => setRows((rs) => [...rs, newRow()])}
          >
            <IconPlus />
            Add Document
          </button>
        )}
      </div>

      {rows.length > 0 && (
        <div className="card space-y-3 p-0 divide-y divide-slate-100">
          {rows.map((row) => (
            <PendingRowForm
              key={row.key}
              row={row}
              onTypeChange={(documentType) => patchRow(row.key, { documentType })}
              onLabelChange={(label) => patchRow(row.key, { label })}
              onPickFile={(file) => pickFile(row.key, file)}
              onRemove={() => removeRow(row.key)}
              onSave={() => saveRow(row)}
            />
          ))}
        </div>
      )}

      <div className="card overflow-hidden p-0">
        {docs.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-400">No documents uploaded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {docs.map((d) =>
              renamingId === d.id ? (
                <li key={d.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                  <IconDocument />
                  <select
                    className="input w-auto min-w-[190px] flex-1 py-1 text-sm sm:flex-none"
                    value={renameType}
                    onChange={(e) => setRenameType(e.target.value)}
                  >
                    <option value="">Document Type…</option>
                    {DOCUMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input min-w-[160px] flex-1 py-1 text-sm"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    placeholder="Document name"
                    autoFocus
                  />
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    <button
                      className="shrink-0 text-brand-blue hover:underline"
                      onClick={() => {
                        saveEdit(d.id, renameValue.trim() || d.label, renameType);
                        setRenamingId(null);
                      }}
                    >
                      Save
                    </button>
                    <button className="shrink-0 text-slate-400" onClick={() => setRenamingId(null)}>
                      Cancel
                    </button>
                  </div>
                </li>
              ) : (
                <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <IconDocument />
                  <button
                    className="min-w-0 flex-1 truncate text-left font-medium text-ink hover:text-brand-blue"
                    onClick={() => view(d.id)}
                  >
                    {loadingViewId === d.id ? 'Opening…' : d.label}
                  </button>
                  {d.documentType && (
                    <span className="hidden shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 sm:inline-block">
                      {d.documentType}
                    </span>
                  )}
                  <span className="hidden shrink-0 text-xs text-slate-400 sm:inline">{fmtOrDash(d.createdAt)}</span>
                  {canManage && (
                    <>
                      <button
                        className="shrink-0 text-slate-400 hover:text-ink"
                        onClick={() => {
                          setRenamingId(d.id);
                          setRenameValue(d.label);
                          setRenameType(d.documentType ?? '');
                        }}
                        title="Edit"
                      >
                        <IconPencil />
                      </button>
                      <button className="shrink-0 text-slate-400 hover:text-red-600" onClick={() => remove(d.id)} title="Delete">
                        <IconTrash />
                      </button>
                    </>
                  )}
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      {viewing && <DocumentViewerModal doc={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function PendingRowForm({
  row,
  onTypeChange,
  onLabelChange,
  onPickFile,
  onRemove,
  onSave,
}: {
  row: PendingRow;
  onTypeChange: (documentType: string) => void;
  onLabelChange: (label: string) => void;
  onPickFile: (file: File) => void;
  onRemove: () => void;
  onSave: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const canSave = !!row.documentType && !!row.file && row.label.trim().length > 0 && !row.busy;

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPickFile(file);
          if (inputRef.current) inputRef.current.value = '';
        }}
      />

      <select
        className="input w-auto min-w-[190px] flex-1 sm:flex-none"
        value={row.documentType}
        onChange={(e) => onTypeChange(e.target.value)}
      >
        <option value="" disabled>
          Document Type…
        </option>
        {DOCUMENT_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      {row.file ? (
        <>
          <input
            className="input min-w-[160px] flex-1"
            value={row.label}
            onChange={(e) => onLabelChange(e.target.value)}
            placeholder="Document name"
          />
          <button type="button" className="shrink-0 text-xs text-slate-400 hover:text-ink" onClick={() => inputRef.current?.click()}>
            Change file
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn-secondary flex shrink-0 items-center gap-1.5 py-1.5 text-xs"
          onClick={() => inputRef.current?.click()}
        >
          <IconUpload />
          Upload
        </button>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button className="btn-primary py-1.5 text-xs" disabled={!canSave} onClick={onSave}>
          {row.busy ? 'Uploading…' : 'Save'}
        </button>
        <button type="button" className="btn-secondary py-1.5 text-xs" onClick={onRemove}>
          Remove
        </button>
      </div>

      {row.error && <p className="w-full text-xs text-red-600">{row.error}</p>}
    </div>
  );
}
