import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import config from '../app.config.ts';
import plugin from '../plugins/with-scene-delegate.cjs';

const MOBIEL = fileURLToPath(new URL('..', import.meta.url));
const { SCENE_MANIFEST, SCENE_DELEGATE_SWIFT, removeWindowFromAppDelegate } = plugin;

// De AppDelegate uit het sjabloon van de geïnstalleerde Expo: die schrijft
// prebuild, dus daar moet de plugin op passen.
function sjabloonAppDelegate() {
  return execFileSync(
    'tar',
    ['-xzOf', join(MOBIEL, 'node_modules/expo/template.tgz'), 'package/ios/HelloWorld/AppDelegate.swift'],
    { encoding: 'utf8' },
  );
}

test('the scene plugin is registered (iOS 27 stops the app at launch without scenes)', () => {
  assert.ok(config.plugins.includes('./plugins/with-scene-delegate.cjs'));
});

test('the Info.plist names one window scene with SceneDelegate', () => {
  assert.equal(SCENE_MANIFEST.UIApplicationSupportsMultipleScenes, false);
  const [rol] = SCENE_MANIFEST.UISceneConfigurations.UIWindowSceneSessionRoleApplication;
  assert.equal(rol.UISceneDelegateClassName, 'SceneDelegate');
  // De klasse heeft dezelfde ObjC-naam, los van de Swift-module (DispatchVictoria).
  assert.match(SCENE_DELEGATE_SWIFT, /@objc\(SceneDelegate\)\nclass SceneDelegate: UIResponder, UIWindowSceneDelegate/);
});

test('the app delegate keeps the factory but no longer makes the window', () => {
  const voor = sjabloonAppDelegate();
  assert.match(voor, /UIWindow\(frame: UIScreen\.main\.bounds\)/, 'template still makes its own window');
  const na = removeWindowFromAppDelegate(voor);
  assert.doesNotMatch(na, /UIWindow\(frame:/);
  assert.doesNotMatch(na, /startReactNative/);
  assert.match(na, /reactNativeFactory = factory/);
  assert.match(na, /return super\.application\(application, didFinishLaunchingWithOptions: launchOptions\)/);
  // Een tweede prebuild-ronde laat het bestand zoals het is.
  assert.equal(removeWindowFromAppDelegate(na), na);
});

test('the scene delegate starts the same module the template did, in a scene window', () => {
  const module = sjabloonAppDelegate().match(/withModuleName: "([^"]+)"/)[1];
  assert.ok(SCENE_DELEGATE_SWIFT.includes(`withModuleName: "${module}"`));
  assert.match(SCENE_DELEGATE_SWIFT, /UIWindow\(windowScene: windowScene\)/);
  assert.match(SCENE_DELEGATE_SWIFT, /appDelegate\.window = window/);
});

test('an unknown AppDelegate fails the prebuild instead of building a broken app', () => {
  assert.throws(() => removeWindowFromAppDelegate('class AppDelegate {}'), /window block/);
});
