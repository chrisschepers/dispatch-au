# Dispatch for iOS and Android

Native Expo SDK 57 / React Native 0.86 starter, in the existing Dispatch repository. This is a personal development preview, not an App Store or Google Play release. It does not wrap the website in a WebView.

## Included

- Native incident list, separate official warning banners, categories, search, pull-to-refresh and filters.
- Apple Maps on iOS / Google Maps on Android, real supplied pins, warning polygons including holes, optional local radius.
- Melbourne timestamps, foreground refresh every 60 seconds, stale and failure states that retain the last successful in-memory feed.
- Suggested Victorian places plus current incident locations, optional foreground geolocation, one locally saved place and radius.
- Device appearance, accessible control labels, safe-area handling, native details sheet and sharing.
- Pro preview with honest availability text. No purchases, account entitlements, background push or cloud synchronization are active.

No Railway credentials, ChatGPT cookies or Stripe secrets are included. The app fetches the public VicEmergency GeoJSON directly and uses the same tested normalization logic as the website. Current incidents are not persisted between launches; a cold start offline shows an unavailable state.

## Run on a phone or simulator

Use Node 24. In this directory run `npm ci` and `npm start`. Scan the Expo QR code using an Expo Go version compatible with SDK 57. `npm run ios` opens the iOS simulator; `npm run android` uses an available Android emulator. The local server must remain running. To test on a physical phone, use the normal LAN server, with the phone and computer on the same network.

The prototype supports Expo Go. If its current store version no longer supports SDK 57, use a development build matching the project SDK. See [Expo project creation](https://docs.expo.dev/get-started/create-a-project/).

## Native packages

`npm run ios:native` / `npm run android:native` generate and build local native projects when Xcode / the Android SDK are installed. Generated `ios/` and `android/` directories are intentionally ignored; app configuration owns their reproducible settings.

EAS profiles are ready in `eas.json`: `simulator` (iOS simulator), `preview` (internal distribution, Android APK) and `production` (store builds). Link this as its own Expo project before the first EAS build. No EAS project, signing credentials, TestFlight release or Play Console entry has been created in this step. The current identifiers are `com.chrisschepers.dispatchau` on both platforms; verify availability and final branding before store registration.

For standalone Android maps set `GOOGLE_MAPS_ANDROID_API_KEY` through EAS environment configuration or an ignored local `.env`. Restrict it to Maps SDK for Android, the Android package and signing SHA-1 certificate. The production Android profile fails configuration if the key is absent. A preview APK without the key shows an explicit map-setup message; its incident list works. Expo Go uses its existing maps configuration. iOS uses Apple Maps and does not need a Google Maps key. [Expo map setup](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/)

## Validation and shared logic

`npm run check:domain`, `npm test`, `npm run typecheck`, `npx expo-doctor`, `npm run export`.

`npm run export` produces the iOS and Android JavaScript/Hermes bundles and assets. These are **not** installable IPA/APK files and do not verify native compilation or device runtime behaviour. GitHub Actions exports both bundles from a clean installation and retains them for seven days.

`src/domain/` contains generated copies of the pure root `lib/incidents.ts` and `lib/places.ts`. After changing the shared root domain, run `npm run sync:domain` here. CI rejects drift. This keeps the mobile directory independently buildable without importing the web app's React/runtime dependencies.

## Before a paid/public launch

Confirm feed reuse rights, perform iPhone/Android device testing, configure native signing and Android Maps, choose consumer identity, and implement verified mobile purchase/restore and background push. Store subscriptions need StoreKit/Google Play Billing integration, with server-side entitlement verification. Do not open web Stripe Checkout as a substitute for the mobile purchase flow. [Expo in-app purchases](https://docs.expo.dev/guides/in-app-purchases/)

See [the Railway plan](../docs/MOBILE-RAILWAY-NL.md) for backend scope and [verification](VERIFICATION.md) for the actual checks performed.

The repository licence applies to Dispatch-specific code. The original Expo starter notice is retained in [EXPO-TEMPLATE-LICENSE](EXPO-TEMPLATE-LICENSE); third-party dependencies retain their own licences.
