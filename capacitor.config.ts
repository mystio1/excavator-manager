import type { CapacitorConfig } from '@capacitor/cli';

// This app has live Server Actions, sessions, and a database — it can't be
// statically exported into `webDir`. Instead the WebView loads the real
// deployed site directly; `webDir` above only satisfies Capacitor's setup
// requirement and is never actually shown.
const config: CapacitorConfig = {
  appId: 'com.excavatormanager.app',
  appName: 'Excavator Manager',
  webDir: 'www',
  server: {
    url: 'https://excavator-manager.onrender.com',
    cleartext: false,
  },
};

export default config;
