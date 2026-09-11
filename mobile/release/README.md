# First TestFlight build

Target app: Dispatch Victoria (display name in the app: Dispatch)
Bundle identifier: `com.chrisschepers.dispatchau`
Marketing version: `0.1.0`
Initial build number: `1`
Audience: the owner's TestFlight testing; no public App Store release or external tester invitations have been requested.

The local native iOS project is generated using Expo prebuild. Native source and build outputs are ignored by Git. Apple credentials, certificates and private keys must never enter this repository.

Release preparation on 11 September 2026:

- Expo Go simulator checks passed for the main interface; see `../VERIFICATION.md`.
- CocoaPods installed successfully.
- The native app module is named DispatchVictoria through a config plugin, avoiding the collision with Apple’s system Dispatch module while retaining the visible app name.
- The local arm64 Release archive compiled successfully (0.1.0, build 1), including its production JavaScript. It is unsigned and cannot yet be uploaded to TestFlight.
- EAS CLI is not signed in on this Mac.
- Automatic approval review blocked using the existing App Store Connect key referenced by the other app project. That key has not been read or used for Dispatch. Explicit approval is required before using it for this app's Apple setup/signing/upload.

After Apple authorization, resolve or create the exact Dispatch app record, obtain valid app-specific provisioning with an available distribution certificate, produce a signed App Store archive/export, upload it, and check Apple's processing status. Set `ascAppId` only to the actual Dispatch record returned by Apple. Never reuse the 112 Meldingen app ID, bundle ID or provisioning profile.

Test notes are in `testflight-notes.txt`. Do not send external invitations or submit a public App Store release as part of this upload.
