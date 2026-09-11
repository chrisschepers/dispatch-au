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
- Signed device archive and App Store export passed. Exported IPA metadata retains the native startup fix and identifies version 0.1.2 (3). Apple processed build `57950e3d-c0fc-4fe5-9ce2-106b84f9b4a2` as `VALID`; it is assigned to the owner’s internal group with status `IN_BETA_TESTING`. GitHub Actions passed for commit `c83f8f27b5a56658d7e3945fad60850318268c99` (run `34605583720`).

## 0.1.3 (4) — 11 September 2026

- Mobile TypeScript check, 4 mobile model/preferences/geometry tests and iOS/Android production bundle export passed.
- Backend: 9 tests passed, including invalid XML, Canberra DST conversion, public-field extraction, XML carriage returns, database persistence, legacy text repair, stale source retention, historical warnings and local HTTP API input validation.
- Root lint, 9 shared parser tests, diff whitespace check and domain copy check passed.
- Standalone Release on iPhone 17 Pro / iOS 26.5: cold launch without Metro; existing Melbourne 25 km preference retained; live Victoria incidents; ACT region selection; ambulance category selection; Canberra map tiles and pins loaded; seven-day history choice persisted across terminate/launch.
- During UI checking, ACT encoded carriage returns were visible in suburb text. Fixed the source parser and repaired the one already historical record. The final live endpoint reports zero escaped suburb names.
- Railway persistent volume retained original collection start times across deployments. At 15:28 UTC the seven-day endpoint contained 13 Victoria incidents (3 earlier) and 15 ACT incidents (1 earlier). Both sources were fresh. These counts include planned activities hidden by default and are snapshots, not daily totals.
- iOS signed archive metadata is 0.1.3 (4), provider module DispatchVictoria. Export and code-signature verification passed; Apple reports VALID / IN_BETA_TESTING with access for the existing owner group.
- Android bundle compilation passed; no physical Android runtime or Google Play distribution was tested. Android production maps still require the configured Google Maps key. Seven-day retention has unit coverage but cannot yet have seven days of live observations.

## 0.1.4 (5) — Dispatch Australia

- Backend tests: 15 passed. Added stable Victoria CAD migration/agency handoff, NSW/QLD parsing and elevated warning handling, combined-source health, and Adelaide time / coordinate-free SA parsing.
- Mobile tests: 6 passed; includes combined-state source links and namespaces, preference compatibility and sorting by known source time instead of collection-batch arrival. Mobile types, root lint, diff whitespace and iOS/Android production exports passed.
- Standalone Release cold launch on iPhone 17 Pro / iOS 26.5 passed. Combined list visibly contains ACT ambulance calls, NSW incidents, Horsham, one current Lynbrook record and one Yea record. Unknown call times carry Updated/Seen labels. Warnings are collapsed, with Nearby / Map / Settings retained.
- South Australia selection loads two ordinary CFS records in the checked snapshot, uses Adelaide time, and explicitly explains missing coordinates in both the list and map view. Current records can be older than the history window while still published by the source; their actual dates remain visible.
- Live parity check at 16:44 UTC compared all seven incident records then published in the VicEmergency combined feed, including its two planned burns and Caldwell NSW record, against the nationwide API: none missing. All stored Victoria source IDs were unique. This is a snapshot check, not proof that every emergency call is public or every future update will arrive.
- All five live sources were ready and fresh. The collector retained existing history across deployments. SA is list-only; NSW/QLD source cadence is about 30 minutes.
- Signed iOS archive/export and strict code-signature verification passed. Metadata identifies Dispatch Australia 0.1.4 (5), retaining ExpoModulesProviderModuleName=DispatchVictoria. Apple accepted upload delivery d6e35532-df80-43b0-b3e4-be3b52e2d21d without errors.
- Android production bundle export passed; physical Android execution and the production Google Maps key remain outstanding. The Sites web preview was not changed in this native release.
- Combined Apple Maps tiles and incident pins loaded across VIC/ACT/NSW/QLD. Settings visibly shows Dispatch Australia 0.1.4, all five source links and the persisted seven-day history preference.
- Apple build d6e35532-df80-43b0-b3e4-be3b52e2d21d is VALID / IN_BETA_TESTING and is assigned to the existing owner group. Final Railway deployment 62624f54-0b7f-416a-9259-b7eb9691cbdb succeeded with all five sources fresh.
