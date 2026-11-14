import type { Config } from 'tailwindcss'

/**
 * Colours resolve to CSS variables declared in `src/styles/index.css`, so the
 * whole product re-themes from one block and utilities stay theme-aware without
 * `dark:` variants scattered through the components.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        raised: 'var(--bg-raised)',
        sunken: 'var(--bg-sunken)',
        hover: 'var(--bg-hover)',
        active: 'var(--bg-active)',
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
          text: 'var(--accent-text)',
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
        DEFAULT: 'var(--radius)',
        lg: 'var(--radius-lg)',
      },
      boxShadow: {
        overlay: 'var(--shadow-overlay)',
      },
      fontFamily: {
        sans: ['DM Sans Variable', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      /*
       * Five steps, and nothing between them. Anything that does not fit one of
       * these is a level the interface does not need.
       *
       *   hero    one number per screen, the answer itself
       *   figure  a section's own total
       *   title   a section heading
       *   body    everything a person reads as a sentence
       *   label   units, axes, timestamps — never a sentence
       */
      fontSize: {
        hero: ['40px', { lineHeight: '1', letterSpacing: '-0.022em' }],
        figure: ['24px', { lineHeight: '1.1', letterSpacing: '-0.016em' }],
        title: ['17px', { lineHeight: '1.3', letterSpacing: '-0.008em' }],
        body: ['15px', { lineHeight: '1.5' }],
        label: ['12px', { lineHeight: '1.35' }],
      },
      transitionTimingFunction: {
        DEFAULT: 'var(--ease)',
      },
      maxWidth: {
        app: '1180px',
      },
    },
  },
  plugins: [],
} satisfies Config
