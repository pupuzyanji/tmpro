'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { captureTouch, getConsent, isPublicPath, pausePosthog, setConsent, track, trackPublicPage } from '@/lib/analytics';

const VISIT_SENT_KEY = 'tmpro:visit-sent';

/** v031.A — mounted once in the root layout. On public pages it remembers
 *  the campaign the visitor came from, counts the visit, and shows the
 *  consent banner; inside the signed-in app it switches analytics off. */
export function MarketingTracker() {
  const pathname = usePathname() ?? '/';
  const [askConsent, setAskConsent] = useState(false);
  const isPublic = isPublicPath(pathname);

  useEffect(() => {
    if (!isPublic) {
      pausePosthog();
      setAskConsent(false);
      return;
    }
    captureTouch();
    setAskConsent(getConsent() === null);
    try {
      // One "visit" per browser tab session, however many pages are viewed.
      if (!sessionStorage.getItem(VISIT_SENT_KEY)) {
        sessionStorage.setItem(VISIT_SENT_KEY, '1');
        track('visit');
      }
    } catch { /* storage unavailable */ }
    if (pathname === '/pricing') track('pricing_view');
    void trackPublicPage(pathname);
  }, [pathname, isPublic]);

  if (!isPublic || !askConsent) return null;

  const choose = (value: 'yes' | 'no') => {
    setConsent(value);
    setAskConsent(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Analytics consent"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:flex sm:items-center sm:gap-4"
    >
      <p className="text-sm text-slate-600">
        We&apos;d like to use analytics on these pages to see which links bring people here and how the pages are
        used, including anonymised session recordings. Nothing is recorded once you sign in.{' '}
        <Link href="/privacy-policy" className="font-medium text-ink underline">
          Privacy policy
        </Link>
      </p>
      <div className="mt-3 flex shrink-0 gap-2 sm:mt-0">
        <button type="button" className="btn-secondary !py-1.5" onClick={() => choose('no')}>
          Decline
        </button>
        <button type="button" className="btn-primary !py-1.5" onClick={() => choose('yes')}>
          Accept
        </button>
      </div>
    </div>
  );
}
