'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Bare /careers has no tenant in it — the real careers site is always
 * tenant-scoped at /careers/[tenantSlug] (see CareersService). This is only
 * here because the generic, pre-auth login screen's "Go to the careers
 * page" link has nowhere else to point before any organization is known;
 * it also keeps the old ?tenant=<slug> links (from the previous /careers
 * stub) working.
 */
export default function CareersRedirectPage() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
      <Suspense fallback={null}>
        <RedirectToTenant />
      </Suspense>
    </div>
  );
}

function RedirectToTenant() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const tenant = params.get('tenant') ?? 'stockhub-demo';
    router.replace(`/careers/${tenant}`);
  }, [params, router]);

  return <>Loading…</>;
}
