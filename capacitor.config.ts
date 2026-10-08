import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pradana93.budgetapp',
  appName: 'Budget App',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#1d4ed8',
      showSpinner: true,
      spinnerColor: '#ffffff',
    },
  },
};

export default config;
