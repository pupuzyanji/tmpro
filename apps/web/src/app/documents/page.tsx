'use client';

import { useApi } from '@/lib/use-api';
import { DocumentsTab } from '@/app/people/[id]/documents-tab';
import { AdminDocumentsBrowser } from './admin-documents';

/** Documents sidebar item. Admin/HR get the tenant-wide browser — every
 *  document on file, across every employee, grouped by tag — since they're
 *  the roles responsible for the records rather than a set of documents of
 *  their own. Everyone else gets the self-service "My Documents" view: the
 *  same Contract/ID/Other slots as the People profile's Documents tab,
 *  scoped to their own employee record. An Admin/HR account with no linked
 *  employee profile of its own simply has nothing extra to show below the
 *  tenant-wide browser. */
export default function DocumentsPage() {
  const { session, ready, call, uploadWithFields } = useApi();

  if (!ready) return null;

  const role = session?.user.role;
  if (role === 'ADMIN' || role === 'HR') {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Documents</h1>
          <p className="text-sm text-slate-500">
            Every document on file for the organization, grouped by tag. Expand a tag to see who it belongs to.
          </p>
        </div>
        <AdminDocumentsBrowser />
      </div>
    );
  }

  const employeeId = session?.profile?.id;
  if (!employeeId) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-ink">My Documents</h1>
        <p className="text-sm text-slate-500">
          This account isn&apos;t linked to an employee profile, so there are no personal documents to show here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">My Documents</h1>
        <p className="text-sm text-slate-500">
          Contract Documents, Official ID and Other Files on your employee record — upload PDFs (and images for ID /
          Other) and view them inline.
        </p>
      </div>
      {/* Only Admin/HR reach the tenant-wide browser above — everyone who
          lands here is viewing their own record, so they can add documents
          but editing/deleting is still Admin/HR only. */}
      <DocumentsTab employeeId={employeeId} call={call} uploadWithFields={uploadWithFields} canAdd canManage={false} />
    </div>
  );
}
