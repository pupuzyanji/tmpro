'use client';

import { useEffect, useRef, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { ApiError } from '@/lib/api';
import { fmtOrDash } from './types';
import { IconDocument, IconPencil, IconTrash, IconUpload } from '@/components/icons';

interface DocumentMeta {
  id: string;
  category: 'CONTRACT' | 'ID' | 'OTHER';
  label: string;
  fileName: string;
  mimeType: string;
  createdAt: string;
}
interface DocumentFull extends DocumentMeta {
  dataUrl: string;
}

const SLOTS: Array<{ category: DocumentMeta['category']; title: string; hint: string; accept: string }> = [
  { category: 'CONTRACT', title: 'Contract Documents', hint: 'PDF only', accept: 'application/pdf' },
  { category: 'ID', title: 'Official ID', hint: 'PDF or image', accept: 'application/pdf,image/png,image/jpeg,image/webp,image/gif' },
  { category: 'OTHER', title: 'Other Files', hint: 'PDF or image', accept: 'application/pdf,image/png,image/jpeg,image/webp,image/gif' },
];

/** Documents tab on the People profile — Contract Documents, Official ID and
 *  Other Files, each uploaded with a name given at upload time and viewable
 *  inline (PDFs render in an iframe, images directly) without leaving the
 *  page. Upload/delete is allowed for Admin or the employee managing their
 *  own documents (see EmployeeDocumentsController) — `canEdit` here reflects
 *  that broader rule, not the Admin-only rule used by the rest of the
 *  profile. */
export function DocumentsTab({
  employeeId,
  call,
  uploadWithFields,
  canEdit,
}: {
  employeeId: string;
  call: ReturnType<typeof useApi>['call'];
  uploadWithFields: ReturnType<typeof useApi>['uploadWithFields'];
  canEdit: boolean;
}) {
  const [docs, setDocs] = useState<DocumentMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<DocumentFull | null>(null);
  const [loadingViewId, setLoadingViewId] = useState<string | null>(null);

  function refresh() {
    return call<DocumentMeta[]>(`/employees/${employeeId}/documents`)
      .then(setDocs)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load documents.'));
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

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

  async function rename(id: string, label: string) {
    setError(null);
    try {
      await call(`/employees/${employeeId}/documents/${id}`, { method: 'PATCH', body: JSON.stringify({ label }) });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not rename document.');
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        {SLOTS.map((slot) => (
          <DocumentSlot
            key={slot.category}
            slot={slot}
            docs={docs.filter((d) => d.category === slot.category)}
            canEdit={canEdit}
            employeeId={employeeId}
            uploadWithFields={uploadWithFields}
            onUploaded={refresh}
            onView={view}
            onDelete={remove}
            onRename={rename}
            viewingId={loadingViewId}
          />
        ))}
      </div>

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={() => setViewing(null)}>
          <div className="flex h-full max-h-[85vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="truncate text-sm font-medium text-ink">{viewing.label}</p>
              <button className="text-sm text-slate-500 hover:text-ink" onClick={() => setViewing(null)}>
                Close
              </button>
            </div>
            <div className="flex-1 overflow-auto p-2">
              {viewing.mimeType === 'application/pdf' ? (
                <iframe title={viewing.label} src={viewing.dataUrl} className="h-full min-h-[70vh] w-full rounded-md" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={viewing.dataUrl} alt={viewing.label} className="mx-auto max-h-[75vh] rounded-md object-contain" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentSlot({
  slot,
  docs,
  canEdit,
  employeeId,
  uploadWithFields,
  onUploaded,
  onView,
  onDelete,
  onRename,
  viewingId,
}: {
  slot: (typeof SLOTS)[number];
  docs: DocumentMeta[];
  canEdit: boolean;
  employeeId: string;
  uploadWithFields: ReturnType<typeof useApi>['uploadWithFields'];
  onUploaded: () => Promise<void> | void;
  onView: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, label: string) => void;
  viewingId: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  function pickFile(file: File) {
    setPendingFile(file);
    setLabel(file.name.replace(/\.[^.]+$/, ''));
  }

  async function confirmUpload() {
    if (!pendingFile) return;
    setBusy(true);
    setError(null);
    try {
      await uploadWithFields(`/employees/${employeeId}/documents`, pendingFile, {
        category: slot.category,
        label: label.trim() || pendingFile.name,
      });
      setPendingFile(null);
      setLabel('');
      await onUploaded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload document.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="card space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-ink">{slot.title}</h3>
        <p className="text-xs text-slate-400">{slot.hint}</p>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

      <ul className="space-y-2">
        {docs.length === 0 && <li className="text-xs text-slate-400">No files uploaded.</li>}
        {docs.map((d) =>
          renamingId === d.id ? (
            <li key={d.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2.5 py-2 text-xs">
              <IconDocument />
              <input
                className="input flex-1 py-1 text-xs"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                autoFocus
              />
              <button
                className="shrink-0 text-brand-blue hover:underline"
                onClick={() => {
                  onRename(d.id, renameValue.trim() || d.label);
                  setRenamingId(null);
                }}
              >
                Save
              </button>
              <button className="shrink-0 text-slate-400" onClick={() => setRenamingId(null)}>
                Cancel
              </button>
            </li>
          ) : (
            <li key={d.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2.5 py-2 text-xs">
              <IconDocument />
              <div className="min-w-0 flex-1">
                <button className="block truncate font-medium text-ink hover:text-brand-blue" onClick={() => onView(d.id)}>
                  {viewingId === d.id ? 'Opening…' : d.label}
                </button>
                <p className="truncate text-[11px] text-slate-400">{fmtOrDash(d.createdAt)}</p>
              </div>
              {canEdit && (
                <>
                  <button
                    className="shrink-0 text-slate-400 hover:text-ink"
                    onClick={() => {
                      setRenamingId(d.id);
                      setRenameValue(d.label);
                    }}
                    title="Rename"
                  >
                    <IconPencil />
                  </button>
                  <button className="shrink-0 text-slate-400 hover:text-red-600" onClick={() => onDelete(d.id)} title="Delete">
                    <IconTrash />
                  </button>
                </>
              )}
            </li>
          ),
        )}
      </ul>

      {canEdit && (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <input
            ref={inputRef}
            type="file"
            accept={slot.accept}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) pickFile(file);
            }}
          />
          {pendingFile ? (
            <div className="space-y-2">
              <div>
                <label className="label">File name</label>
                <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
              </div>
              <div className="flex gap-2">
                <button className="btn-primary py-1.5 text-xs" disabled={busy} onClick={confirmUpload}>
                  {busy ? 'Uploading…' : 'Save'}
                </button>
                <button
                  className="btn-secondary py-1.5 text-xs"
                  onClick={() => {
                    setPendingFile(null);
                    setLabel('');
                    if (inputRef.current) inputRef.current.value = '';
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn-secondary flex w-full items-center justify-center gap-1.5 py-1.5 text-xs"
              onClick={() => inputRef.current?.click()}
            >
              <IconUpload />
              Upload
            </button>
          )}
        </div>
      )}
    </div>
  );
}
