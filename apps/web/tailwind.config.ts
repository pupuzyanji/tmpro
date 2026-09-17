import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Theme-switchable tokens — CSS custom properties defined per
        // `data-theme` in globals.css, so every `text-ink` / `bg-accent` /
        // `bg-chrome-*` usage across the app repaints when the sidebar
        // theme toggle flips `data-theme` on <html>.
        ink: 'var(--ink)',
        accent: 'var(--accent)',
        chrome: {
          bg: 'var(--chrome-bg)',
          panel: 'var(--chrome-panel)',
          panelSoft: 'var(--chrome-panel-soft)',
        },
        // Brand gradient family, sampled from the tmPro logo. Kept static
        // (not theme-switched) — used for per-person avatar colors and other
        // spots where a fixed rainbow palette is the point, not "the" brand
        // color.
        brand: {
          cyan: '#14B8F0',
          blue: '#2B3AF5',
          indigo: '#5B21D6',
          violet: '#8B2FD9',
          magenta: '#D626C9',
          pink: '#F9268F',
          orange: '#FF8A1E',
        },
      },
      backgroundImage: {
        'brand-gradient': 'var(--brand-gradient)',
        'brand-gradient-soft': 'var(--brand-gradient-soft)',
        'sidebar-gradient': 'var(--sidebar-gradient)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.9rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        card: 'var(--card-shadow)',
      },
    },
  },
  plugins: [],
} satisfies Config;
