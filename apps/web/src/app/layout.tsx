import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';
import './globals.css';

export const metadata: Metadata = {
  title: 'tmPro — your talent.unified',
  description: 'Talent management platform',
};

// Runs before paint so the page never flashes the classic theme before
// switching to a remembered "midnight" choice — see the sidebar toggle in
// app-shell.tsx, which is what actually writes this key.
const THEME_INIT_SCRIPT = `
  try {
    var t = localStorage.getItem('tmpro:theme');
    if (t === 'midnight') document.documentElement.setAttribute('data-theme', 'midnight');
  } catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
