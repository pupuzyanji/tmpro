export interface DocumentFull {
  id: string;
  label: string;
  mimeType: string;
  dataUrl: string;
}

/** The one "view a document inside the platform" modal — PDFs render in an
 *  iframe, images directly, nothing ever leaves the app as a download link.
 *  Shared by the People profile's Documents tab, the self-service "My
 *  Documents" page, and the Admin/HR tenant-wide Documents browser, so this
 *  stays the single place that behavior is defined. */
export function DocumentViewerModal({ doc, onClose }: { doc: DocumentFull; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={onClose}>
      <div
        className="flex h-full max-h-[85vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="truncate text-sm font-medium text-ink">{doc.label}</p>
          <button className="text-sm text-slate-500 hover:text-ink" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="flex-1 overflow-auto p-2">
          {doc.mimeType === 'application/pdf' ? (
            <iframe title={doc.label} src={doc.dataUrl} className="h-full min-h-[70vh] w-full rounded-md" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={doc.dataUrl} alt={doc.label} className="mx-auto max-h-[75vh] rounded-md object-contain" />
          )}
        </div>
      </div>
    </div>
  );
}
