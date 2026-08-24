import type { CapacitorConfig } from '@capacitor/cli';

// This app has live Server Actions, sessions, and a database — it can't be
// statically exported into `webDir`. Instead the WebView loads the real
// deployed site directly; `webDir` is only used for the bundled offline
// fallback page below (www/offline.html), never shown otherwise.
const config: CapacitorConfig = {
  appId: 'com.excavatormanager.app',
  appName: 'Excavator Manager',
  webDir: 'www',
  server: {
    url: 'https://excavator-manager.onrender.com',
    cleartext: false,
    // Shown instead of the WebView's raw browser error page (e.g. Chrome's
    // "Webpage not available" / net::ERR_NAME_NOT_RESOLVED) on any load
    // failure — no internet, DNS failure, or the server being down. Native
    // Capacitor behavior (Bridge.getErrorUrl()), not custom native code.
    errorPath: 'offline.html',
  },
};

export default config;
