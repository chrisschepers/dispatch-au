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
    // Home screen label; the App Store name is "Emergencies Near Me: Australia".
    // `name` stays as is: it also names the native project and module.
    infoPlist: { ITSAppUsesNonExemptEncryption: false, CFBundleDisplayName: 'Emergencies' },
  },
  android: {
    package: 'com.chrisschepers.dispatchau',
    // FCM config from the Firebase project (public app config, committed like in
    // 112 Meldingen). The workflow sets GOOGLE_SERVICES_FILE when the file is
    // there; without it the build still works, just without push.
    ...(process.env.GOOGLE_SERVICES_FILE ? { googleServicesFile: process.env.GOOGLE_SERVICES_FILE } : {}),
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'POST_NOTIFICATIONS'],
    // No ads and no background work: keep these out of the manifest, so the
    // Play data safety form stays simple.
    blockedPermissions: [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.RECORD_AUDIO',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'com.google.android.gms.permission.AD_ID',
    ],
    predictiveBackGestureEnabled: true,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#d83329',
      monochromeImage: './assets/adaptive-icon.png',
    },
  },
  plugins: [
    './plugins/with-native-module-name.cjs',
    './plugins/with-release-signing.cjs',
    './plugins/with-android-label.cjs',
    'expo-font',
    [
      'expo-notifications',
      {
        // TestFlight and App Store builds talk to Apple's production push service.
        mode: 'production',
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
          'Your location is used to show emergency incidents near you, only while you use the app.',
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
