/** v030.C — shown in the page area the moment a sidebar link is clicked,
 *  while the next page arrives, so a click never looks ignored. */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
        <div className="h-3.5 w-72 animate-pulse rounded bg-slate-100" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-white ring-1 ring-slate-100" />
        ))}
      </div>
    </div>
  );
}
