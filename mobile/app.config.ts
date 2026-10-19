import type { ExpoConfig } from 'expo/config';
const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
if (
  process.env.EAS_BUILD_PROFILE === 'production' &&
  process.env.EAS_BUILD_PLATFORM === 'android' &&
  !mapsKey
) {
  throw new Error(
    'A production Android build requires GOOGLE_MAPS_ANDROID_API_KEY, restricted to the app package and signing certificate.',
  );
}
const config: ExpoConfig = {
  name: 'Dispatch Australia',
  slug: 'dispatch-australia',
  version: '0.2.0',
  scheme: 'dispatchau',
  platforms: ['ios', 'android'],
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  ios: {
    bundleIdentifier: 'com.chrisschepers.dispatchau',
    buildNumber: '7',
    supportsTablet: true,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: 'com.chrisschepers.dispatchau',
    predictiveBackGestureEnabled: true,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#d83329',
      monochromeImage: './assets/adaptive-icon.png',
    },
  },
  plugins: [
    './plugins/with-native-module-name.cjs',
    'expo-font',
    [
      'expo-notifications',
      {
        sounds: [
          './assets/sounds/zacht.wav', './assets/sounds/tik.wav', './assets/sounds/melodie.wav',
          './assets/sounds/pager.wav', './assets/sounds/bel.wav', './assets/sounds/dubbel.wav',
        ],
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Dispatch uses your location to show emergency incidents near you, only while you use the app.',
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: false,
      },
    ],
    ...(mapsKey
      ? [
          ['react-native-maps', { androidGoogleMapsApiKey: mapsKey }] as [
            string,
            Record<string, string>,
          ],
        ]
      : []),
  ],
  extra: {
    androidMapsConfigured: Boolean(mapsKey),
    feedApiUrl: 'https://incident-feed-production.up.railway.app',
  },
};
export default config;
