/**
 * Is cloud sync set up in this build at all?
 *
 * Answered from the environment alone, in a module with no imports, so the shell
 * can decide whether to show a cloud button without pulling the Firebase SDK
 * (some 180 kB gzipped) into the first load for people who will never sign in.
 */
export const cloudAvailable: boolean = Boolean(
  import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_PROJECT_ID &&
    import.meta.env.VITE_FIREBASE_APP_ID,
)
