/**
 * Ondertekent de release-build met onze eigen keystore (overgenomen uit 112
 * Meldingen, met eigen omgevingsvariabelen).
 *
 * Expo's template zet `signingConfig signingConfigs.debug` op de release-build:
 * prima om te proberen, maar Play weigert een debug-ondertekende bundel. Deze
 * plugin voegt een release-config toe die het wachtwoord uit de omgeving leest
 * (in CI uit de repo-secrets), zodat er nooit een wachtwoord in de repo staat.
 *
 * Ontbreekt de keystore of het wachtwoord — bijvoorbeeld bij een lokale
 * prebuild — dan valt hij terug op debug, zodat `expo run:android` gewoon
 * blijft werken.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_CONFIG = `
        release {
            def keystoreBestand = file('release.keystore')
            if (keystoreBestand.exists() && System.getenv('DISPATCH_KEYSTORE_PASSWORD') != null) {
                storeFile keystoreBestand
                storePassword System.getenv('DISPATCH_KEYSTORE_PASSWORD')
                keyAlias System.getenv('DISPATCH_KEY_ALIAS') ?: 'dispatch'
                keyPassword System.getenv('DISPATCH_KEY_PASSWORD')
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;

    // 1) De release-signingConfig toevoegen, direct na de debug-config.
    if (!gradle.includes('release.keystore')) {
      gradle = gradle.replace(
        /signingConfigs \{\s*debug \{[\s\S]*?\}\n/,
        (m) => `${m}${RELEASE_CONFIG}\n`,
      );
    }

    // 2) De release-build laten tekenen met die config, maar alleen als de
    //    keystore er echt is (anders blijft debug staan en faalt de build niet).
    //    Let op: pak de regel BINNEN buildTypes.release. Een simpele match op
    //    "signingConfig signingConfigs.debug" raakt eerst die van buildTypes.
    //    debug, en op de regel eronder mikken werkte niet omdat het sjabloon
    //    daar een commentaarregel en een def heeft staan (17-08: de eerste
    //    Android-build werd daardoor debug-ondertekend en Play weigerde 'm).
    gradle = gradle.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
      // Let op de "=": zonder toewijzing leest Groovy dit als de methode
      // signingConfig(boolean) en klapt de build om op "Boolean cannot be cast
      // to SigningConfig" (17-08, tweede poging).
      `$1signingConfig = (file('release.keystore').exists() && System.getenv('DISPATCH_KEYSTORE_PASSWORD') != null) ? signingConfigs.release : signingConfigs.debug`,
    );

    cfg.modResults.contents = gradle;
    return cfg;
  });
};
