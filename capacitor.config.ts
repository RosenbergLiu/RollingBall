import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rollingball.game',
  appName: 'Rolling Ball',
  webDir: 'dist',
  backgroundColor: '#070b18',
  ios: {
    contentInset: 'never',
    scrollEnabled: false,
    backgroundColor: '#070b18',
  },
};

export default config;
