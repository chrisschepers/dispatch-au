/**
 * Home screen label on Android: "Emergencies", like CFBundleDisplayName on
 * iOS. `name` in app.config.ts stays "Dispatch Australia" because it also
 * names the native project, and Android would otherwise show that.
 */
const { withStringsXml, AndroidConfig } = require('expo/config-plugins');

module.exports = function withAndroidLabel(config) {
  return withStringsXml(config, (mod) => {
    mod.modResults = AndroidConfig.Strings.setStringItem(
      [{ $: { name: 'app_name', translatable: 'false' }, _: 'Emergencies' }],
      mod.modResults,
    );
    return mod;
  });
};
