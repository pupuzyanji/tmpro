'use client';

import { Suspense, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface Status {
  complete: boolean;
  ready: boolean;
  organisationName: string | null;
  email: string | null;
  trialEndsAt: string | null;
}

/** v025.A — Stripe Checkout sends the customer here. Polls the API until
 *  the tenant is switched on (the API finalizes it itself if the webhook
 *  hasn't arrived yet), then points them at sign-in. */
function SuccessInner() {
  const sessionId = useSearchParams().get('session_id') ?? '';
  const [status, setStatus] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const s = await apiFetch<Status>(`/billing/checkout-status?session_id=${encodeURIComponent(sessionId)}`, null);
        setStatus(s);
        if (s.ready) return;
      } catch {
        // keep trying for a little while
      }
      if (++tries < 20) timer = setTimeout(poll, 2000);
      else setFailed(true);
    };
    poll();
    return () => clearTimeout(timer);
  }, [sessionId]);

  const ready = status?.ready;
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f6fc] px-6">
      <div className="card w-full max-w-md py-10 text-center">
        <Image src="/logo-full.png" alt="tmPro" width={150} height={52} className="mx-auto" />
        {ready ? (
          <>
            <span className="mx-auto mt-8 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-3xl text-emerald-600">
              ✓
            </span>
            <h1 className="mt-4 text-xl font-bold text-ink">You&apos;re all set!</h1>
            <p className="mt-2 text-sm text-slate-500">
              {status?.organisationName}&apos;s workspace is ready.
              {status?.trialEndsAt && (
                <> Your free trial runs until {new Date(status.trialEndsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}.</>
              )}
            </p>
            <p className="mt-1 text-sm text-slate-500">Sign in with {status?.email} and the password you just chose.</p>
            <Link href="/login" className="btn-primary mt-6 !px-6 !py-2.5">
              Sign in to tmPro
            </Link>
          </>
        ) : failed ? (
          <>
            <h1 className="mt-8 text-xl font-bold text-ink">We&apos;re still confirming your payment</h1>
            <p className="mt-2 text-sm text-slate-500">
              This can take a minute. Try signing in shortly — we&apos;ll also email you as soon as your workspace is
              ready. If it doesn&apos;t arrive, contact us at us@bitware.app.
            </p>
            <Link href="/login" className="btn-secondary mt-6">
              Go to sign in
            </Link>
          </>
        ) : (
          <>
            <div className="mx-auto mt-8 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#8b2fd9]" />
            <h1 className="mt-4 text-lg font-bold text-ink">Setting up your workspace…</h1>
            <p className="mt-1 text-sm text-slate-500">Confirming your subscription with our payment provider.</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={null}>
      <SuccessInner />
    </Suspense>
  );
}
