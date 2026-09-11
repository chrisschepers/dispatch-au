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
- The local arm64 Release archive compiled successfully (0.1.0, build 1), including its production JavaScript. A manually signed App Store archive and IPA export also succeeded. Code signature verification passed with the dedicated signing keychain.
- EAS CLI is not signed in on this Mac.
- The owner explicitly approved the existing App Store Connect API key for Dispatch setup, signing and upload. Apple API authentication succeeded.
- Dispatch has its own registered bundle identifier, new distribution certificate and active App Store provisioning profile. No other app certificates were revoked. Signing material is stored outside the repository in a dedicated local keychain.
- Apple validation reached App Store Connect but returned “No suitable application records were found” (-19000). A Dispatch app record still needs to be created through the website; the browser requires an Apple login and the Mac was locked. The IPA has not been uploaded and is not yet available in TestFlight.

After the owner unlocks the Mac and signs in to App Store Connect, create the Dispatch Victoria app record with bundle identifier `com.chrisschepers.dispatchau`, primary language English (Australia), SKU `dispatch-victoria-ios`, then validate/upload the prepared IPA and check Apple's processing status. Set `ascAppId` only to the actual Dispatch record returned by Apple. Never reuse the 112 Meldingen app ID, bundle ID or provisioning profile.

Test notes are in `testflight-notes.txt`. Do not send external invitations or submit a public App Store release as part of this upload.

Local prepared IPA: `~/Developer/dispatch-builds/ios/0.1.0-1/Dispatch.ipa` (outside Git). Minimum iOS version: 16.4. Export SHA-256: `ab9e777184120020e3bcbd544d87d28580ffca2878c67789513cac753e8c23af`.
