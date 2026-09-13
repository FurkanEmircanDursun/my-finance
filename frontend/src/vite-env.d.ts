/// <reference types="vite/client" />

/** Injected at build time from package.json — see `define` in vite.config.ts. */
declare const __APP_VERSION__: string

/**
 * pdfjs-dist and tesseract.js are loaded through dynamic `import()` with paths
 * that have no bundled type declarations. They are typed loosely here so the
 * rest of the codebase can stay strict.
 */
declare module 'pdfjs-dist/build/pdf.min.mjs' {
  const lib: any
  export = lib
}

declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const url: string
  export default url
}
