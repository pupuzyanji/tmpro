'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** v019.A: editing a tenant now happens inline via a modal on the main
 *  Tenants page (see ../page.tsx and ../tenant-form.tsx), not this
 *  dedicated route — kept only so an old bookmarked/linked URL still goes
 *  somewhere useful instead of 404ing. */
export default function EditTenantRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/platform-admin');
  }, [router]);
  return null;
}
