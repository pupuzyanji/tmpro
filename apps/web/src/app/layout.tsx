import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';
import { MarketingTracker } from '@/components/marketing-tracker';
import './globals.css';

export const metadata: Metadata = {
  title: 'tmPro — your talent.unified',
  description: 'Talent management platform',
};

// v028.B: Midnight is the default theme, so the server renders
// <html data-theme="midnight">. This runs before paint and switches to
// Classic only when that was the remembered choice (written by the sidebar
// toggle in app-shell.tsx), so the page never flashes the wrong theme.
const THEME_INIT_SCRIPT = `
  try {
    if (localStorage.getItem('tmpro:theme') === 'classic') document.documentElement.removeAttribute('data-theme');
  } catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the init script above may remove data-theme
    // from <html> before React hydrates, which is intentional. This only
    // silences that one element's attributes, not its children.
    <html lang="en" data-theme="midnight" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
          <MarketingTracker />
        </AuthProvider>
      </body>
    </html>
  );
}
