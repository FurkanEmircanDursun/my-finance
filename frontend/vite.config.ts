import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Manual chunks keep the first paint small: pdfjs and tesseract are only pulled
 * when a scanned PDF is actually dropped, recharts is a separate chunk so a
 * cold visit to the import screen never downloads the charting library, and
 * firebase (only reached through the dynamic imports in `store/AppStore.tsx`)
 * stays out of the eager bundle for the far more common visitor who never
 * touches cloud sync.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

export default defineConfig({
  plugins: [react()],
  // Surfaced in Ayarlar. A support conversation that starts with "which
  // version?" is the one thing a shipped app should never have to guess at.
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    port: 3003,
    strictPort: false,
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
        diagnostics: fileURLToPath(new URL('./diagnostics.html', import.meta.url)),
      },
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('pdfjs-dist')) return 'pdf'
          if (id.includes('tesseract')) return 'ocr'
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) return 'charts'
          if (id.includes('@firebase/performance') || id.includes('firebase/performance')) return 'firebase-performance'
          // Auth and Firestore are separate chunks: asking "who is signed in?"
          // at start-up needs only the first, and the database client (the
          // larger half) is fetched when a session actually starts syncing.
          if (id.includes('firebase') || id.includes('@firebase')) {
            if (id.includes('firestore')) return 'firebase-store'
            if (id.includes('auth')) return 'firebase-auth'
            return 'firebase-core'
          }
          if (id.includes('react')) return 'react'
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
} as Parameters<typeof defineConfig>[0])
