const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : undefined;

  if (!res.ok) {
    throw new ApiError(body?.message ?? res.statusText, res.status);
  }
  return body as T;
}

/** For CSV "Data Import" uploads — deliberately doesn't set Content-Type so
 *  the browser can attach its own multipart boundary. */
export async function apiUpload<T>(path: string, token: string | null, file: File): Promise<T> {
  return apiUploadWithFields<T>(path, token, file, {});
}

/** Same as apiUpload, but also sends extra non-file form fields alongside
 *  the file (e.g. a document's category/label) — multer parses these into
 *  the request body next to the uploaded file. */
export async function apiUploadWithFields<T>(
  path: string,
  token: string | null,
  file: File,
  fields: Record<string, string>,
): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { method: 'POST', headers, body: form });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : undefined;

  if (!res.ok) {
    throw new ApiError(body?.message ?? res.statusText, res.status);
  }
  return body as T;
}

/** Multiple named file fields in one multipart request (e.g. the public
 *  job-application form's separate `cv`/`coverLetter` uploads), alongside
 *  ordinary text fields — same shape as apiUploadWithFields, generalized
 *  past its one-file limit. `files` values may be undefined/omitted for an
 *  optional upload (e.g. no cover letter). */
export async function apiUploadMultipart<T>(
  path: string,
  token: string | null,
  files: Record<string, File | undefined>,
  fields: Record<string, string>,
  init: RequestInit = {},
): Promise<T> {
  const form = new FormData();
  for (const [key, file] of Object.entries(files)) {
    if (file) form.append(key, file);
  }
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...init, method: 'POST', headers, body: form });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : undefined;

  if (!res.ok) {
    throw new ApiError(body?.message ?? res.statusText, res.status);
  }
  return body as T;
}
