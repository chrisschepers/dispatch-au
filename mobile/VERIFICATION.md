# Mobile verification — 11 September 2026

Passed:

- Expo Doctor: 21/21 checks, including SDK and native dependency compatibility.
- TypeScript checks for the mobile app.
- Three focused native-domain tests: persistence parsing and free-place quota, coordinate/radius validation, and warning polygon conversion with holes preserved.
- Shared-domain drift check against the web parser and places source.
- iOS and Android production JavaScript/Hermes exports. Each bundle is approximately 1.7 MB plus the single Ionicons font asset.
- Existing web tests (9), types, lint and production build after adding the mobile directory.

The iPhone 17 Pro simulator (iOS 26.5) was visually tested through Expo Go after the Mac was unlocked: live list and official warnings, incident details, native Apple Maps, category filtering, Melbourne radius filtering, saving/removing a local place, and dark/system appearance all worked. The test place was removed and the app returned to All Victoria with system appearance. At that stage, location permission, persistence across a full process restart and Android runtime behaviour had not been tested. The local Expo connection required IPv4-first DNS resolution because localhost initially bound only to ::1 while the manifest advertised 127.0.0.1.

A standalone arm64 iOS Release archive (0.1.0, build 1) was successfully compiled locally with Xcode after fixing the app module name collision with Apple’s Dispatch module. The archive includes the production JavaScript bundle. A separate signed archive and App Store IPA export subsequently succeeded; code signature verification passed using the dedicated Apple signing keychain. The Dispatch App Store Connect record was subsequently created and Apple accepted the IPA upload without errors (delivery `6505df17-edf0-43f3-b03b-102b31e711cb`). Apple processing finished with `VALID`. Build 0.1.0 (1) is attached to the owner’s internal test group; the API reports `IN_BETA_TESTING` and the website shows `Testing`. Installation on a physical iPhone has not yet been verified. No Android native binary has been compiled, and no Play Store upload, native purchase test or background push test has been performed.

The owner subsequently reported a white screen in TestFlight build 1. This was reproduced by installing a standalone Release build on the iPhone 17 Pro simulator. The system log showed `[runtime not ready]: Error: Cannot find native module 'ExpoAsset'`. Renaming the app's Swift module to `DispatchVictoria` had left Expo's provider lookup using the executable name `Dispatch`. Setting `ExpoModulesProviderModuleName` to the same Swift module name made the otherwise identical binary start and load live incidents.

The config plugin now sets both names together, and a fresh Expo prebuild preserves the correction. Version 0.1.1 (2) was then rebuilt as a standalone Release app and cold-launched in the simulator. Live incidents and warnings, incident details, Apple Maps, and a dark preference persisted across process termination and an app update all passed. Settings display the actual configured version. The system theme was restored. The original native-module/startup exception was absent from the final launch log. TypeScript and the three domain tests passed. The signed device archive and App Store IPA export passed, including a check that the exported IPA contains version 0.1.1, build 2, and the provider-module override. Apple accepted the upload without errors (delivery `7053dd10-628a-4dc8-9b04-4b75d2f5e1b2`), processed it as `VALID`, and now reports `IN_BETA_TESTING` for build 2. The owner’s test group contains build 2; defective build 1 was removed from the group. GitHub Actions passed for fix commit `ac92eb95fca0912a9a72e80bf6d128fc27f4f0af` (run `34602893961`). A physical iPhone test remains for the owner; foreground location permission and Android native runtime remain unverified.

For subsequent releases, compilation, Expo Go checks and Apple processing alone are insufficient: cold-launch the standalone Release build, inspect startup errors and verify the main interface before uploading.

The dependency audit reports ten moderate findings in the Expo build/config dependency chain involving xcode/uuid, with no high or critical findings. Its suggested forced remediation downgrades Expo to SDK 46 and is not a compatible fix for this SDK 57 app. No forced downgrade was applied. Recheck upstream fixes before a public release.

GitHub Actions now also performs a clean mobile install, domain check, tests, type check and both platform exports. Downloadable CI exports are bundles/assets, not installable applications.

Three-tab simplification — 0.1.2 (3):

- Used the owner’s local 112 Meldingen `BuurtScreen` and `TabBalk` as the layout reference: compact scrolling area/category controls, quiet incident rows and a floating three-tab dock.
- Removed the branded header, Pro promotion, standalone Places tab, incident search and planned-feature screens. Active area persists automatically, with radius and appearance in Settings. The map uses most of its screen; incident detail can focus its location on the in-app map.
- TypeScript and the existing three domain tests passed. The standalone Release simulator build cold-launched, loaded live incidents and visibly showed only Nearby, Map and Settings. A screenshot confirmed approximately six full incident rows in the viewport. Settings, the area sheet and Melbourne selection were exercised; the Mac then locked before the final map/radius visual check. Startup logs reported no missing native modules or unhandled JavaScript exceptions.
- Device archive, upload and final TestFlight status are being completed.
