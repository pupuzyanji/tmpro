import { NextResponse, type NextRequest } from 'next/server';

// v031.A — tmpro.bitware.app/go/<short-name>: counts the click (the API
// ignores link previews and crawlers) and sends the visitor on to the page
// the link points at, with its campaign tags attached.
export const dynamic = 'force-dynamic';

const API_URL = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Behind a proxy req.url is the internal address — rebuild the public one.
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const origin = `${proto}://${host}`;
  let target = '/pricing';
  try {
    const res = await fetch(`${API_URL}/marketing/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug,
        userAgent: (req.headers.get('user-agent') ?? '').slice(0, 400),
        country: req.headers.get('cf-ipcountry') ?? undefined,
      }),
      cache: 'no-store',
    });
    if (res.ok) {
      const body = (await res.json()) as { url?: string };
      // Internal paths only — never redirect off-site.
      if (body.url && body.url.startsWith('/') && !body.url.startsWith('//')) target = body.url;
    }
  } catch {
    /* API unreachable — still send the visitor somewhere useful */
  }
  return NextResponse.redirect(new URL(target, origin), 302);
}
