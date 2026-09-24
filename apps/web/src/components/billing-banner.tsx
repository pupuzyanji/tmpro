'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { BANDS, isBandKey } from '@/lib/billing-plans';

interface Banner {
  show: boolean;
  billingStatus?: string;
  trialEndsAt?: string | null;
  seatsUsed?: number;
  seatCap?: number | null;
  nextBand?: string | null;
  selfServe?: boolean;
}

/** v025.A — one slim strip under the header for Admin/HR: payment failed,
 *  trial ending soon, or close to the plan's employee limit. Everyone else
 *  gets nothing (the API returns show:false for other roles). */
export function BillingBanner({ accessToken, role }: { accessToken: string; role: string }) {
  const [b, setB] = useState<Banner | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (role !== 'ADMIN' && role !== 'HR') return;
    apiFetch<Banner>('/billing/banner', accessToken)
      .then(setB)
      .catch(() => setB(null));
  }, [accessToken, role, pathname]);

  if (!b?.show) return null;
  const isAdmin = role === 'ADMIN';
  const billingLink = isAdmin ? (
    <Link href="/settings/billing" className="font-semibold underline">
      Go to Billing
    </Link>
  ) : (
    <span>Ask your Admin to update it.</span>
  );

  let tone = '';
  let body: React.ReactNode = null;

  if (b.billingStatus === 'PAST_DUE') {
    tone = 'bg-red-50 text-red-800 border-red-100';
    body = (
      <>
        <b>Payment failed.</b> We couldn&apos;t charge your card — update it to keep tmPro running. {billingLink}
      </>
    );
  } else if (b.seatCap != null && (b.seatsUsed ?? 0) >= Math.floor(b.seatCap * 0.9)) {
    const full = (b.seatsUsed ?? 0) >= b.seatCap;
    tone = full ? 'bg-amber-50 text-amber-900 border-amber-100' : 'bg-amber-50/60 text-amber-900 border-amber-100';
    const up = isBandKey(b.nextBand) ? BANDS[b.nextBand].label : null;
    body = (
      <>
        <b>{full ? 'Employee limit reached.' : 'Nearly at your employee limit.'}</b> You have {b.seatsUsed} of {b.seatCap}{' '}
        employees on your plan.{' '}
        {b.selfServe
          ? up
            ? <>Move up to {up} to keep adding people. {billingLink}</>
            : <>Contact us about the 200+ plan. {billingLink}</>
          : <>Contact tmPro to raise your limit.</>}
      </>
    );
  } else if (b.billingStatus === 'TRIALING' && b.trialEndsAt) {
    const days = Math.max(0, Math.ceil((new Date(b.trialEndsAt).getTime() - Date.now()) / 86_400_000));
    if (days > 3) return null;
    tone = 'bg-sky-50 text-sky-900 border-sky-100';
    body = (
      <>
        <b>
          Your free trial ends in {days} day{days === 1 ? '' : 's'}.
        </b>{' '}
        Your card on file will be charged then — nothing to do if you&apos;re staying. {isAdmin && billingLink}
      </>
    );
  } else {
    return null;
  }

  return <div className={`border-b px-8 py-2.5 text-sm ${tone}`}>{body}</div>;
}
