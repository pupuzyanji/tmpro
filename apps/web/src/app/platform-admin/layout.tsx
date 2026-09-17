import { PlatformAuthProvider } from '@/lib/platform-auth';

/** Everything under /platform-admin gets its own auth context, entirely
 *  separate from the tenant AuthProvider in the root layout — see
 *  lib/platform-auth.tsx. AppShell (root layout) already skips its
 *  tenant-sidebar chrome for this whole prefix, so each page below owns its
 *  own minimal layout. */
export default function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  return <PlatformAuthProvider>{children}</PlatformAuthProvider>;
}
