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
  version: '1.0.4',
  scheme: 'dispatchau',
  platforms: ['ios', 'android'],
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  // Android only: the brand red as the theme's colorPrimary (the app in the
  // recents screen) instead of Expo's default blue. colorAccent comes from
  // plugins/with-android-accent.cjs.
  primaryColor: '#e5372c',
  icon: './assets/icon.png',
  ios: {
    bundleIdentifier: 'com.chrisschepers.dispatchau',
    buildNumber: '12',
    // iPhone only: App Review tests on an iPad, and an iPhone-only app runs
    // there in compatibility mode without needing an iPad layout or screenshots.
    supportsTablet: false,
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
    // iOS 27 stops the app at launch without the scene-based life cycle
    // (crash 1.0.3 (11) on the iPhone Duo). Expo 57 has none; this adds a
    // SceneDelegate like Expo 58. Drop it when upgrading to Expo 58.
    './plugins/with-scene-delegate.cjs',
    './plugins/with-release-signing.cjs',
    './plugins/with-android-label.cjs',
    './plugins/with-tab-iconen.cjs',
    './plugins/with-android-accent.cjs',
    'expo-font',
    // Launch screen, so there is no white template flash before the first
    // screen. iOS: a plain background in the colour of the first screen
    // (PALET_LICHT/PALET_DONKER bg), no logo, as the HIG asks of a launch
    // screen. Android 12+ always shows an icon, so it gets the launcher glyph
    // on the launcher red in light and dark (older Android shows the same
    // through the compat splash). The in-app Light/Dark choice cannot reach
    // these native screens: they follow the phone. App.tsx keeps the splash
    // up until the first screen is ready.
    // iOS gets a 1x1 transparent image: only with an image does the plugin
    // point the storyboard at the SplashScreenBackground colour set (light
    // and dark). Without one the view kept systemBackgroundColor, so light
    // mode launched white and then turned #f2f2f7 grey.
    [
      'expo-splash-screen',
      {
        backgroundColor: '#f2f2f7',
        dark: { backgroundColor: '#000000' },
        ios: { image: './assets/opstart-leeg.png', imageWidth: 1 },
        android: {
          image: './assets/adaptive-icon.png',
          imageWidth: 200,
          backgroundColor: '#d83329',
          dark: { backgroundColor: '#d83329' },
        },
      },
    ],
    // No system scrim over 3-button navigation: the M3 tab bar shows through
    // and src/components/Navigatiebalk sets the button colour per theme.
    ['expo-navigation-bar', { enforceContrast: false }],
    [
      'expo-notifications',
      {
        // TestFlight and App Store builds talk to Apple's production push service.
        mode: 'production',
        // Android status bar and shade: the broadcast glyph from the adaptive
        // icon, white on transparent (96 px, about 20 of 24 dp), tinted in the
        // brand red. Without it Android shows a grey square of the launcher icon.
        icon: './assets/notification-icon.png',
        color: '#e5372c',
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
    // Push on Android only with the Firebase config (see googleServicesFile
    // above). Without it the app hides every push promise and never asks for
    // notification permission (src/pushBeschikbaar.ts). Gradle evaluates this
    // file again for the embedded config, so the workflow must set
    // GOOGLE_SERVICES_FILE for the bundle step too (lesson 30-10, maps flag).
    androidPushConfigured: Boolean(process.env.GOOGLE_SERVICES_FILE),
    feedApiUrl: 'https://incident-feed-production.up.railway.app',
  },
};
export default config;
