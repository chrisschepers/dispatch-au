const { withXcodeProject } = require('expo/config-plugins');

// Swift's system Dispatch module is imported by Foundation. The app must not
// shadow it, even though its user-facing product name remains Dispatch.
module.exports = function withNativeModuleName(config) {
  return withXcodeProject(config, (mod) => {
    const configurations = mod.modResults.pbxXCBuildConfigurationSection();
    let updated = 0;
    for (const configuration of Object.values(configurations)) {
      const settings = configuration && configuration.buildSettings;
      if (!settings) continue;
      const bundle = String(settings.PRODUCT_BUNDLE_IDENTIFIER || '').replaceAll('"', '');
      if (bundle !== config.ios.bundleIdentifier) continue;
      settings.PRODUCT_MODULE_NAME = 'DispatchVictoria';
      updated += 1;
    }
    if (!updated) throw new Error('Dispatch app build configurations were not found.');
    return mod;
  });
};
