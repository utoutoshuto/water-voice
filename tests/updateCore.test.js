const test = require('node:test');
const assert = require('node:assert/strict');
const {
  compareVersions,
  pickMacZipAsset,
  resolveUpdate,
  getAppBundlePath,
  buildInstallScript,
} = require('../src/shared/updateCore');

const assets = [
  { name: 'Water.Voice-1.5.0-arm64-mac.zip', browser_download_url: 'https://x/arm.zip', size: 10 },
  { name: 'Water.Voice-1.5.0-mac.zip', browser_download_url: 'https://x/intel.zip', size: 11 },
  { name: 'Water.Voice-1.5.0-arm64.dmg', browser_download_url: 'https://x/arm.dmg' },
  { name: 'Water.Voice.Setup.1.5.0.exe', browser_download_url: 'https://x/setup.exe' },
];

test('compareVersions compares semver with optional v prefix', () => {
  assert.ok(compareVersions('v1.4.1', '1.4.0') > 0);
  assert.ok(compareVersions('1.10.0', '1.9.9') > 0);
  assert.equal(compareVersions('1.4.0', 'v1.4.0'), 0);
  assert.ok(compareVersions('1.3.9', '1.4.0') < 0);
  assert.equal(compareVersions('garbage', '1.0.0'), 0);
});

test('pickMacZipAsset picks the zip for the running architecture', () => {
  assert.equal(pickMacZipAsset(assets, 'arm64').browser_download_url, 'https://x/arm.zip');
  assert.equal(pickMacZipAsset(assets, 'x64').browser_download_url, 'https://x/intel.zip');
  assert.equal(pickMacZipAsset([], 'arm64'), null);
});

test('resolveUpdate reports newer releases only', () => {
  const release = { tag_name: 'v1.5.0', assets, html_url: 'https://gh/r' };
  const update = resolveUpdate({ release, currentVersion: '1.4.1', platform: 'darwin', arch: 'arm64' });
  assert.equal(update.available, true);
  assert.equal(update.latestVersion, '1.5.0');
  assert.equal(update.asset.url, 'https://x/arm.zip');

  assert.equal(resolveUpdate({ release, currentVersion: '1.5.0', platform: 'darwin', arch: 'arm64' }).available, false);
  assert.equal(resolveUpdate({ release: { ...release, prerelease: true }, currentVersion: '1.0.0', platform: 'darwin', arch: 'arm64' }).available, false);
  assert.equal(resolveUpdate({ release: { ...release, assets: [] }, currentVersion: '1.0.0', platform: 'darwin', arch: 'arm64' }).available, false);

  const win = resolveUpdate({ release, currentVersion: '1.4.1', platform: 'win32', arch: 'x64' });
  assert.equal(win.available, true);
  assert.equal(win.asset, null);
  assert.equal(win.releaseUrl, 'https://gh/r');
});

test('getAppBundlePath extracts the .app bundle from execPath', () => {
  assert.equal(
    getAppBundlePath('/Applications/Water Voice.app/Contents/MacOS/Water Voice'),
    '/Applications/Water Voice.app'
  );
  assert.equal(getAppBundlePath('/usr/local/bin/electron'), null);
});

test('buildInstallScript waits for the old process and quotes paths', () => {
  const script = buildInstallScript({
    pid: 123,
    newAppPath: "/tmp/new/Water Voice.app",
    targetAppPath: "/Applications/Water Voice.app",
    logPath: "/tmp/it's.log",
  });
  assert.match(script, /kill -0 123/);
  assert.match(script, /ditto '\/tmp\/new\/Water Voice.app' '\/Applications\/Water Voice.app'/);
  assert.match(script, /'\/tmp\/it'\\''s.log'/);
  assert.match(script, /mv '\/Applications\/Water Voice.app.old' '\/Applications\/Water Voice.app'/);
});
