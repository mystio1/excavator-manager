import type { CapacitorConfig } from '@capacitor/cli';

// `webDir` is the static-exported Next.js build (see `npm run build:android`
// / scripts/build-android.mjs), bundled straight into the APK — same
// approach as the Shivam Transport app this was matched to. The WebView
// never loads a live URL; every page is local, and all data comes from
// fetch() calls to the deployed API (see src/lib/api-client.ts's
// Capacitor.isNativePlatform() branch), same as a native app calling a
// backend, not a browser loading a website.
const config: CapacitorConfig = {
  appId: 'com.excavatormanager.app',
  appName: 'Excavator Manager',
  webDir: 'out',
};

export default config;
