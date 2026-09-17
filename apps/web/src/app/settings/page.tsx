'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApi } from '@/lib/use-api';

export default function SettingsIndexPage() {
  const router = useRouter();
  const { session, ready } = useApi();

  useEffect(() => {
    if (!ready) return;
    // HR doesn't have Organization (the first Admin-only tab) — land them
    // on the first tab they do have instead of an immediate "Admin-only"
    // message.
    router.replace(session?.user.role === 'HR' ? '/settings/employees' : '/settings/organization');
  }, [ready, session, router]);
  return null;
}
