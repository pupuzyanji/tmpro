'use client';

import Link from 'next/link';

/** Option 5A — icon + label pill, agreed as the one tab style for the whole
 *  app: a light grey pill by default, a solid accent border + soft ring
 *  marking the active tab (no color fill swap, so it reads calmly next to
 *  dense record pages). Every tab bar in the app (People detail, Payroll,
 *  Settings, Platform Admin) renders through this one component so a future
 *  restyle only happens here. */
export interface TabBarItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  /** Route-driven tab (Payroll/Settings sub-nav) — renders as a Link. */
  href?: string;
  /** State-driven tab (People detail, Platform Admin) — renders as a button. */
  onClick?: () => void;
}

const TAB_BASE =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border-2 py-2 pl-3 pr-4 text-sm font-semibold transition-colors';
const TAB_ACTIVE = 'border-accent bg-white text-accent shadow-[0_0_0_3px_var(--accent-ring)]';
const TAB_INACTIVE = 'border-transparent bg-slate-100 text-slate-500 hover:text-ink';

export function TabBar({ items, className }: { items: TabBarItem[]; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className ?? ''}`}>
      {items.map((item) => {
        const cls = `${TAB_BASE} ${item.active ? TAB_ACTIVE : TAB_INACTIVE}`;
        return item.href ? (
          <Link key={item.key} href={item.href} className={cls}>
            {item.icon}
            {item.label}
          </Link>
        ) : (
          <button key={item.key} type="button" onClick={item.onClick} className={cls}>
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
