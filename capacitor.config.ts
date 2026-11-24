import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize, KeyboardStyle } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'com.vhok.aetheria',
  appName: 'Aetheria',
  webDir: 'dist',
  backgroundColor: '#030712',
  server: {
    iosScheme: 'capacitor',
    androidScheme: 'https'
  },
  ios: {
    contentInset: 'never',
    allowsLinkPreview: false,
    scrollEnabled: true,
    backgroundColor: '#030712',
    preferredContentMode: 'mobile'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: '#030712',
      showSpinner: false
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#030712',
      overlaysWebView: true
    },
    Keyboard: {
      resize: KeyboardResize.Native,
      style: KeyboardStyle.Dark,
      resizeOnFullScreen: true
    }
  }
};

export default config;
