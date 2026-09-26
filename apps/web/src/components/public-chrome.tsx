import Image from 'next/image';
import Link from 'next/link';
import { LEGAL } from '@/lib/legal';

/** v026.A — header and footer shared by the public (signed-out) pages:
 *  Pricing, Support, Privacy Policy and Terms of Service. */

export function PublicHeader({ cta = true }: { cta?: boolean }) {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
      <Link href="/pricing" className="flex items-center">
        <Image src="/logo-full.png" alt="tmPro" width={120} height={42} priority />
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/pricing" className="hidden text-slate-500 hover:text-ink sm:inline">
          Pricing
        </Link>
        <Link href="/support" className="hidden text-slate-500 hover:text-ink sm:inline">
          Support
        </Link>
        <Link href="/login" className="font-medium text-slate-600 hover:text-ink">
          Sign in
        </Link>
        {cta && (
          <Link href="/pricing#plans" className="btn-primary">
            Start free trial
          </Link>
        )}
      </nav>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-slate-200/70 bg-white/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} {LEGAL.company}, trading as {LEGAL.tradingName}. {LEGAL.product} — your
          talent.unified
        </p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/pricing" className="hover:text-ink">
            Pricing
          </Link>
          <Link href="/support" className="hover:text-ink">
            Support
          </Link>
          <Link href="/privacy-policy" className="hover:text-ink">
            Privacy Policy
          </Link>
          <Link href="/terms-of-service" className="hover:text-ink">
            Terms of Service
          </Link>
          <a href={`mailto:${LEGAL.supportEmail}`} className="hover:text-ink">
            {LEGAL.supportEmail}
          </a>
        </nav>
      </div>
    </footer>
  );
}

/** Layout for long-form legal documents: title block, table of contents,
 *  numbered sections. */
export function LegalDocument({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: React.ReactNode;
  sections: Array<{ id: string; heading: string; body: React.ReactNode }>;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[#f7f6fc]">
      <PublicHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-16 pt-6">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#8b2fd9]">Legal</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-slate-500">Effective {LEGAL.effectiveDate}</p>
        </div>
        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          <aside className="hidden lg:block">
            <nav className="sticky top-6 rounded-2xl bg-white p-4 text-sm shadow-card">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Contents</p>
              <ol className="space-y-1.5">
                {sections.map((s, i) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="block text-slate-600 hover:text-[#8b2fd9]">
                      {i + 1}. {s.heading}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>
          <article className="legal-prose rounded-2xl bg-white p-6 shadow-card sm:p-10">
            <div className="space-y-3 text-[15px] leading-relaxed text-slate-600">{intro}</div>
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="mt-10 scroll-mt-6">
                <h2 className="text-lg font-bold text-ink">
                  {i + 1}. {s.heading}
                </h2>
                <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-slate-600">{s.body}</div>
              </section>
            ))}
          </article>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
