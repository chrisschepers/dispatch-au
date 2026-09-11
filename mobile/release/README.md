# TestFlight release status

Target app: Dispatch Victoria (display name in the app: Dispatch)
Bundle identifier: `com.chrisschepers.dispatchau`
Marketing version: `0.1.2`
Current build number: `3`
Audience: the owner's TestFlight testing; no public App Store release or external tester invitations have been requested.

The local native iOS project is generated using Expo prebuild. Native source and build outputs are ignored by Git. Apple credentials, certificates and private keys must never enter this repository.

Release preparation on 11 September 2026 (initial build history):

- Expo Go simulator checks passed for the main interface; see `../VERIFICATION.md`.
- CocoaPods installed successfully.
- The native app module is named DispatchVictoria through a config plugin, avoiding the collision with Apple’s system Dispatch module while retaining the visible app name.
- The local arm64 Release archive compiled successfully (0.1.0, build 1), including its production JavaScript. A manually signed App Store archive and IPA export also succeeded. Code signature verification passed with the dedicated signing keychain.
- EAS CLI is not signed in on this Mac.
- The owner explicitly approved the existing App Store Connect API key for Dispatch setup, signing and upload. Apple API authentication succeeded.
- Dispatch has its own registered bundle identifier, new distribution certificate and active App Store provisioning profile. No other app certificates were revoked. Signing material is stored outside the repository in a dedicated local keychain.
- Dispatch Victoria was created in App Store Connect with app ID `6811057872`, primary language English (Australia), and SKU `dispatch-victoria-ios`.
- Apple accepted the signed IPA upload without errors on 11 September 2026 at 12:49 UTC. Delivery UUID: `6505df17-edf0-43f3-b03b-102b31e711cb`. Apple processing completed with `VALID`; internal testing is active (`IN_BETA_TESTING`).
- The internal `Owner testing` group contains the account holder and build 0.1.0 (1). App Store Connect shows `Testing`. The English beta description and build test notes are saved. No public TestFlight link or external tester group was created.

App Store Connect: https://appstoreconnect.apple.com/apps/6811057872/testflight

The EAS production submit profile now points to the actual Dispatch app ID. Never reuse the 112 Meldingen app ID, bundle ID or provisioning profile.

Test notes are in `testflight-notes.txt`. Do not send external invitations or submit a public App Store release as part of this upload.

Local prepared IPA: `~/Developer/dispatch-builds/ios/0.1.0-1/Dispatch.ipa` (outside Git). Minimum iOS version: 16.4. Export SHA-256: `ab9e777184120020e3bcbd544d87d28580ffca2878c67789513cac753e8c23af`.

Startup repair — 0.1.1 (2):

- The owner reported a white screen in build 1. A standalone Release launch reproduced a missing `ExpoAsset` native-module error.
- The native module-name plugin now sets `ExpoModulesProviderModuleName` in Info.plist to match `PRODUCT_MODULE_NAME`. This fixes Expo provider discovery while preserving the visible app name.
- A fresh prebuild and standalone Release simulator cold launch passed. Live feed, details, Apple Maps and persisted appearance were checked. See `../VERIFICATION.md`.
- The signed archive and IPA export succeeded; exported metadata and code signature were verified. Apple accepted the upload without errors (delivery `7053dd10-628a-4dc8-9b04-4b75d2f5e1b2`). Processing is `VALID` and internal status is `IN_BETA_TESTING`. The owner’s group now contains build 2; the defective build 1 was removed from that group.
- New IPA: `~/Developer/dispatch-builds/ios/0.1.1-2/Dispatch.ipa`.

Three-tab simplification — 0.1.2 (3):

- Nearby, Map and Settings only, following the owner’s 112 Meldingen layout.
- Removed Pro marketing, the separate Places tab and large fixed feed headers. Region selection is a sheet; radius lives in Settings.
- Standalone Release launch and main list/settings visual checks passed; see `../VERIFICATION.md` for limits. Apple processing is `VALID` and internal status is `IN_BETA_TESTING`. Build ID: `57950e3d-c0fc-4fe5-9ce2-106b84f9b4a2`. The owner’s group has access to this build.
