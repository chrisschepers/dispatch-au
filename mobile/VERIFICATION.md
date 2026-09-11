# Mobile verification — 11 September 2026

Passed:

- Expo Doctor: 21/21 checks, including SDK and native dependency compatibility.
- TypeScript checks for the mobile app.
- Three focused native-domain tests: persistence parsing and free-place quota, coordinate/radius validation, and warning polygon conversion with holes preserved.
- Shared-domain drift check against the web parser and places source.
- iOS and Android production JavaScript/Hermes exports. Each bundle is approximately 1.7 MB plus the single Ionicons font asset.
- Existing web tests (9), types, lint and production build after adding the mobile directory.

The iPhone 17 Pro simulator (iOS 26.5) was visually tested through Expo Go after the Mac was unlocked: live list and official warnings, incident details, native Apple Maps, category filtering, Melbourne radius filtering, saving/removing a local place, and dark/system appearance all worked. The test place was removed and the app returned to All Victoria with system appearance. Location permission, persistence across a full process restart and Android runtime behaviour have not been tested. The local Expo connection required IPv4-first DNS resolution because localhost initially bound only to ::1 while the manifest advertised 127.0.0.1.

A standalone arm64 iOS Release archive (0.1.0, build 1) was successfully compiled locally with Xcode after fixing the app module name collision with Apple’s Dispatch module. The archive includes the production JavaScript bundle. A separate signed archive and App Store IPA export subsequently succeeded; code signature verification passed using the dedicated Apple signing keychain. Apple validation is blocked because the Dispatch App Store Connect app record has not yet been created (error -19000), so the IPA is not yet available in TestFlight. No Android native binary has been compiled, and no TestFlight or Play Store upload, native purchase test or background push test has been performed.

The dependency audit reports ten moderate findings in the Expo build/config dependency chain involving xcode/uuid, with no high or critical findings. Its suggested forced remediation downgrades Expo to SDK 46 and is not a compatible fix for this SDK 57 app. No forced downgrade was applied. Recheck upstream fixes before a public release.

GitHub Actions now also performs a clean mobile install, domain check, tests, type check and both platform exports. Downloadable CI exports are bundles/assets, not installable applications.
