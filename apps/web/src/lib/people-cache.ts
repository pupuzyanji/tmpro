// v030.C — the People directory, kept in memory between visits.
//
// The first load fetches it; after that the page shows the list it already
// has straight away and refreshes it in the background ("stale while
// revalidate"). Hovering "People" in the sidebar starts the fetch early.
// Keyed by the signed-in user, so a different login never sees another
// person's list; cleared on reload.

import { apiFetch } from './api';

export interface DirectoryPerson {
  id: string;
  employeeCode?: string | null;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  jobTitle: string | null;
  department: string | null;
  status: string;
  startDate: string;
  managerId?: string | null;
  location?: string | null;
  workPhone?: string | null;
  email?: string | null;
  employmentType?: string | null;
  countryCode?: string | null;
}

let cache: { key: string; data: DirectoryPerson[]; at: number } | null = null;
let inflight: { key: string; promise: Promise<DirectoryPerson[]> } | null = null;

/** The list from the last load for this user, if there is one. */
export function cachedPeople(key: string | null | undefined): DirectoryPerson[] | null {
  return key && cache?.key === key ? cache.data : null;
}

/** Fetches the directory (one request at a time per user) and remembers it. */
export function loadPeople(key: string, token: string): Promise<DirectoryPerson[]> {
  if (inflight?.key === key) return inflight.promise;
  const promise = apiFetch<DirectoryPerson[]>('/employees', token)
    .then((data) => {
      cache = { key, data, at: Date.now() };
      return data;
    })
    .finally(() => {
      if (inflight?.promise === promise) inflight = null;
    });
  inflight = { key, promise };
  return promise;
}

/** Start loading early (sidebar hover/focus) unless it was fetched moments ago. */
export function prefetchPeople(key: string | null | undefined, token: string | null | undefined) {
  if (!key || !token) return;
  if (cache?.key === key && Date.now() - cache.at < 15_000) return;
  loadPeople(key, token).catch(() => undefined);
}
