'use client';

import { useApi } from '@/lib/use-api';
import { DocumentsTab } from '@/app/people/[id]/documents-tab';

/** Self-service "My Documents" — the same Contract/ID/Other document slots
 *  as the People profile's Documents tab, scoped to the signed-in user's
 *  own employee record. Anyone without a linked employee profile (e.g. an
 *  Admin account with no employee record) gets an explanatory message
 *  instead, since there's nothing to scope the documents to. */
export default function DocumentsPage() {
  const { session, ready, call, uploadWithFields } = useApi();

  if (!ready) return null;

  const employeeId = session?.profile?.id;
  if (!employeeId) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-ink">My Documents</h1>
        <p className="text-sm text-slate-500">
          This account isn&apos;t linked to an employee profile, so there are no personal documents to show here. An
          Admin can view and manage any employee&apos;s documents from their People profile.
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
      <DocumentsTab employeeId={employeeId} call={call} uploadWithFields={uploadWithFields} canEdit />
    </div>
  );
}
