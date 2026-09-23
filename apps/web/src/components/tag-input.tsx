'use client';

import { useState } from 'react';

/** A generic "type and press Enter to add a chip" tag editor — used for a
 *  requisition's Required Skills (Recruitment → raise requisition) and a
 *  candidate's Skills list on the public application form. Enter or comma
 *  commits the current draft as a tag; Backspace on an empty draft removes
 *  the last tag; clicking a chip's × removes that one. Deliberately plain
 *  Tailwind (not theme-token) colors for the chips — same as every other
 *  slate-gray badge in the app, which stays the same under both themes. */
export function TagInput({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState('');

  function commit() {
    const tag = draft.trim();
    if (tag && !value.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      onChange([...value, tag]);
    }
    setDraft('');
  }

  return (
    <div className={`input flex min-h-[42px] flex-wrap items-center gap-1.5 !py-1.5 ${className}`}>
      {value.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="text-slate-400 hover:text-red-600"
            aria-label={`Remove ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="min-w-[120px] flex-1 border-0 bg-transparent p-0.5 text-sm outline-none"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Backspace' && !draft && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={value.length === 0 ? placeholder : 'Add another…'}
      />
    </div>
  );
}
