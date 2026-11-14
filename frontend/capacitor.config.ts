import type { CapacitorConfig } from '@capacitor/cli'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const iosHasFirebase = existsSync(resolve(__dirname, 'ios/App/App/GoogleService-Info.plist'))

const config: CapacitorConfig = {
  appId: 'com.faraday.followfinance',
  appName: 'Mizan',
  webDir: 'dist',
  android: {
    // The app never phones home except to Firebase (opt-in cloud sync) and its
    // own bundled assets, so cleartext traffic has no reason to be allowed.
    allowMixedContent: false,
  },
  ios: {
    // FirebaseAuthentication configures the native Firebase SDK during plugin
    // registration. Keep the offline app usable until its actual iOS app config
    // is installed; never substitute Android/web Firebase credentials.
    includePlugins: [
      '@capacitor-firebase/analytics',
      ...(iosHasFirebase ? ['@capacitor-firebase/authentication'] : []),
      '@capacitor/app', '@capacitor/local-notifications', '@capacitor/push-notifications',
      '@capacitor/splash-screen', '@capacitor/status-bar',
    ],
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#f5f5fa',
      androidSplashResourceName: 'launch_splash',
    },
    PushNotifications: { presentationOptions: ['alert', 'sound'] },
    FirebaseAuthentication: {
      // The app's own Firebase JS SDK session (see `firebase/auth.ts`) is the
      // single source of truth for who is signed in — on web and on native
      // alike. Without this the plugin would also sign the native Android
      // Firebase Auth SDK in on its own, producing a second session that the
      // JS side never looks at and that can drift out of sync with it.
      skipNativeAuth: true,
      providers: ['google.com'],
    },
  },
}

export default config
