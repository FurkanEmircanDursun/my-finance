import type { Config } from 'tailwindcss'

/**
 * Mizan 2026 — Obsidian Equilibrium Design Tokens.
 * Every colour, radius, shadow, and motion curve resolves to CSS variables in
 * `src/styles/tokens.css`, keeping Dark (Obsidian Studio) and Light (Alabaster Vault)
 * seamlessly unified with zero scattered `dark:` overrides.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        raised: 'var(--bg-raised)',
        elevated: 'var(--bg-elevated)',
        sunken: 'var(--bg-sunken)',
        hover: 'var(--bg-hover)',
        active: 'var(--bg-active)',
        glass: 'var(--bg-glass)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        ink: 'var(--text)',
        muted: 'var(--text-muted)',
        faint: 'var(--text-faint)',
        inverse: 'var(--text-inverse)',
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          soft: 'var(--accent-soft)',
          border: 'var(--accent-border)',
          text: 'var(--accent-text)',
        },
        gold: {
          DEFAULT: 'var(--gold)',
          soft: 'var(--gold-soft)',
        },
        positive: {
          DEFAULT: 'var(--positive)',
          soft: 'var(--positive-soft)',
        },
        negative: {
          DEFAULT: 'var(--negative)',
          soft: 'var(--negative-soft)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          soft: 'var(--warning-soft)',
        },
      },
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        elevated: 'var(--shadow-elevated)',
        overlay: 'var(--shadow-overlay)',
        glow: 'var(--shadow-glow)',
      },
      fontFamily: {
        sans: ['DM Sans Variable', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        display: ['clamp(2.25rem, 4.2vw, 3.25rem)', { lineHeight: '1.05', letterSpacing: '-0.04em' }],
        hero: ['clamp(2rem, 3.6vw, 2.85rem)', { lineHeight: '1.06', letterSpacing: '-0.038em' }],
        figure: ['clamp(1.35rem, 2vw, 1.75rem)', { lineHeight: '1.14', letterSpacing: '-0.028em' }],
        title: ['1.0625rem', { lineHeight: '1.3', letterSpacing: '-0.018em' }],
        body: ['0.9375rem', { lineHeight: '1.55' }],
        label: ['0.75rem', { lineHeight: '1.35', letterSpacing: '0.005em' }],
        micro: ['0.6875rem', { lineHeight: '1.2', letterSpacing: '0.055em' }],
      },
      transitionTimingFunction: {
        DEFAULT: 'var(--ease-smooth)',
        spring: 'var(--ease-spring)',
        smooth: 'var(--ease-smooth)',
        ios: 'var(--ease-ios)',
      },
      maxWidth: {
        app: '1240px',
      },
    },
  },
  plugins: [],
} satisfies Config
