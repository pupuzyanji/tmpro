'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PublicFooter, PublicHeader } from '@/components/public-chrome';
import { LEGAL } from '@/lib/legal';
import { ARTICLES, CATEGORIES, type Article, type Category } from './articles';

function articleText(a: Article): string {
  return [a.title, a.summary, a.who, a.category, ...(a.steps ?? []), ...(a.body ?? []), a.tip, ...(a.tags ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Every word in the query must appear somewhere in the article; title and
 *  tag hits rank first. */
function search(query: string, category: Category | null): Article[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const pool = category ? ARTICLES.filter((a) => a.category === category) : ARTICLES;
  if (!words.length) return pool;
  return pool
    .map((a) => {
      const text = articleText(a);
      if (!words.every((w) => text.includes(w))) return null;
      const title = a.title.toLowerCase();
      const tags = (a.tags ?? []).join(' ').toLowerCase();
      const score = words.reduce((s, w) => s + (title.includes(w) ? 3 : 0) + (tags.includes(w) ? 2 : 0) + 1, 0);
      return { a, score };
    })
    .filter((x): x is { a: Article; score: number } => x !== null)
    .sort((x, y) => y.score - x.score)
    .map((x) => x.a);
}

function IconSearch() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-5 w-5">
      <circle cx="9" cy="9" r="5.5" />
      <path d="m13.2 13.2 3.8 3.8" />
    </svg>
  );
}

function IconMail() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="2.5" y="4.5" width="15" height="11" rx="1.8" />
      <path d="m3 5.5 7 5.5 7-5.5" />
    </svg>
  );
}

function ArticleCard({ a, open, onToggle }: { a: Article; open: boolean; onToggle: () => void }) {
  return (
    <div id={a.slug} className="scroll-mt-6 rounded-2xl bg-white shadow-card">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left">
        <span>
          <span className="block font-semibold text-ink">{a.title}</span>
          <span className="mt-0.5 block text-sm text-slate-500">{a.summary}</span>
        </span>
        <span className={`mt-1 text-xl leading-none text-slate-400 transition-transform ${open ? 'rotate-45' : ''}`}>+</span>
      </button>
      {open && (
        <div className="legal-prose border-t border-slate-100 px-5 pb-5 pt-4 text-[15px] leading-relaxed text-slate-600">
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="badge bg-[#8b2fd9]/10 text-[#8b2fd9]">{a.category}</span>
            {a.who && <span className="badge bg-slate-100 text-slate-600">Who: {a.who}</span>}
          </div>
          {a.steps && (
            <ol>
              {a.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          )}
          {a.body && (
            <ul className={a.steps ? 'mt-3' : ''}>
              {a.body.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
          {a.tip && <p className="mt-4 rounded-xl bg-[#f7f6fc] px-4 py-3 text-sm text-slate-600">💡 {a.tip}</p>}
          <p className="mt-4 text-xs text-slate-400">
            Still stuck?{' '}
            <a href={`mailto:${LEGAL.supportEmail}?subject=${encodeURIComponent(`Help with: ${a.title}`)}`}>Email {LEGAL.supportEmail}</a>
          </p>
        </div>
      )}
    </div>
  );
}

export function SupportCentre() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [openSlugs, setOpenSlugs] = useState<Set<string>>(new Set());

  // Deep links: /support#run-payroll opens and scrolls to that article.
  useEffect(() => {
    const openFromHash = () => {
      const slug = decodeURIComponent(window.location.hash.slice(1));
      if (!slug || !ARTICLES.some((a) => a.slug === slug)) return;
      setQuery('');
      setCategory(null);
      setOpenSlugs((s) => new Set(s).add(slug));
      requestAnimationFrame(() => document.getElementById(slug)?.scrollIntoView({ behavior: 'smooth' }));
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, []);

  const results = useMemo(() => search(query, category), [query, category]);
  const searching = query.trim().length > 0;
  const counts = useMemo(() => Object.fromEntries(CATEGORIES.map((c) => [c, ARTICLES.filter((a) => a.category === c).length])), []);

  const toggle = (slug: string) =>
    setOpenSlugs((s) => {
      const n = new Set(s);
      if (n.has(slug)) n.delete(slug);
      else n.add(slug);
      return n;
    });

  // Group by category unless the user is searching (then rank order wins).
  const groups: Array<[string, Article[]]> = searching
    ? results.length
      ? [[`${results.length} result${results.length === 1 ? '' : 's'} for “${query.trim()}”`, results]]
      : []
    : CATEGORIES.filter((c) => !category || c === category)
        .map((c) => [c, results.filter((a) => a.category === c)] as [string, Article[]])
        .filter(([, list]) => list.length);

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f6fc]">
      <PublicHeader />

      {/* Hero + search */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              'radial-gradient(600px 300px at 15% 0%, rgba(20,184,240,0.18), transparent 60%), radial-gradient(600px 320px at 85% 10%, rgba(214,38,201,0.16), transparent 60%)',
          }}
        />
        <div className="relative mx-auto max-w-3xl px-6 pb-8 pt-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#8b2fd9]">Support centre</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">How can we help?</h1>
          <p className="mt-2 text-slate-500">Search our knowledge base and how-to guides, or email the tmPro team.</p>
          <div className="relative mt-6">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              <IconSearch />
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search help articles, e.g. “run payroll”"
              aria-label="Search the knowledge base"
              className="w-full rounded-2xl border border-slate-200 bg-white py-4 pl-12 pr-4 text-base text-ink shadow-card outline-none transition focus:border-[#8b2fd9] focus:ring-4 focus:ring-[#8b2fd9]/15"
            />
          </div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-16">
        <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
          <div>
            {/* Category chips */}
            <div className="mb-6 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCategory(null)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                  !category ? 'bg-[#8b2fd9] text-white' : 'bg-white text-slate-600 shadow-card hover:text-ink'
                }`}
              >
                All topics
              </button>
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(category === c ? null : c)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                    category === c ? 'bg-[#8b2fd9] text-white' : 'bg-white text-slate-600 shadow-card hover:text-ink'
                  }`}
                >
                  {c} <span className={category === c ? 'text-white/70' : 'text-slate-400'}>{counts[c]}</span>
                </button>
              ))}
            </div>

            {groups.length === 0 && (
              <div className="rounded-2xl bg-white p-8 text-center shadow-card">
                <p className="font-semibold text-ink">No articles match “{query.trim()}”.</p>
                <p className="mt-1 text-sm text-slate-500">
                  Try a different word, or email{' '}
                  <a className="font-medium text-[#8b2fd9] underline" href={`mailto:${LEGAL.supportEmail}?subject=${encodeURIComponent(`Question: ${query.trim()}`)}`}>
                    {LEGAL.supportEmail}
                  </a>{' '}
                  and we&apos;ll help.
                </p>
              </div>
            )}

            {groups.map(([heading, list]) => (
              <section key={heading} className="mb-8">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">{heading}</h2>
                <div className="space-y-3">
                  {list.map((a) => (
                    <ArticleCard key={a.slug} a={a} open={openSlugs.has(a.slug) || (searching && list.length <= 2)} onToggle={() => toggle(a.slug)} />
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* Contact card */}
          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <div className="overflow-hidden rounded-2xl bg-white shadow-card">
              <div className="bg-brand-gradient px-5 py-4 text-white">
                <p className="flex items-center gap-2 font-semibold">
                  <IconMail /> Contact support
                </p>
              </div>
              <div className="space-y-3 px-5 py-4 text-sm text-slate-600">
                <p>Can&apos;t find what you need? Email the tmPro team and we&apos;ll get back to you {LEGAL.supportResponse}.</p>
                <a href={`mailto:${LEGAL.supportEmail}`} className="btn-primary w-full justify-center">
                  {LEGAL.supportEmail}
                </a>
                <p className="text-xs text-slate-400">
                  Include your organisation name and, if something went wrong, what you clicked and any error message. Never send passwords or card numbers by email.
                </p>
              </div>
            </div>
            <div className="rounded-2xl bg-white px-5 py-4 text-sm shadow-card">
              <p className="font-semibold text-ink">Popular</p>
              <ul className="mt-2 space-y-1.5">
                {['getting-started-checklist', 'forgot-password', 'import-employees', 'run-payroll', 'change-plan', 'payment-failed'].map((slug) => {
                  const a = ARTICLES.find((x) => x.slug === slug)!;
                  return (
                    <li key={slug}>
                      <a href={`#${slug}`} className="text-slate-600 hover:text-[#8b2fd9]">
                        {a.title}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="rounded-2xl bg-white px-5 py-4 text-sm shadow-card">
              <p className="font-semibold text-ink">Policies</p>
              <ul className="mt-2 space-y-1.5">
                <li>
                  <Link href="/privacy-policy" className="text-slate-600 hover:text-[#8b2fd9]">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms-of-service" className="text-slate-600 hover:text-[#8b2fd9]">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link href="/pricing" className="text-slate-600 hover:text-[#8b2fd9]">
                    Plans &amp; pricing
                  </Link>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
