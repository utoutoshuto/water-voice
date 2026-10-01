// 自動更新の純粋ロジック。GitHub Releases の最新版と比較し、入れ替え手順を組み立てる。

const RELEASES_LATEST_URL = 'https://api.github.com/repos/utoutoshuto/water-voice/releases/latest';

function parseVersion(value) {
  const match = String(value || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1, 4).map(Number) : null;
}

// a が b より新しければ正、同じなら 0、古ければ負。解釈できない値は比較しない(0)。
function compareVersions(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va || !vb) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (va[i] !== vb[i]) return va[i] - vb[i];
  }
  return 0;
}

// macOS 用の zip アセットを選ぶ(electron-builder の命名: Water.Voice-1.4.1-arm64-mac.zip)。
function pickMacZipAsset(assets, arch) {
  if (!Array.isArray(assets)) return null;
  const zips = assets.filter((asset) => /-mac\.zip$/.test(asset?.name || ''));
  if (arch === 'arm64') {
    return zips.find((asset) => asset.name.includes('-arm64-')) || null;
  }
  return zips.find((asset) => !asset.name.includes('-arm64-')) || null;
}

// GitHub Releases API のレスポンスから、更新が必要かと取得すべきアセットを決める。
function resolveUpdate({ release, currentVersion, platform, arch }) {
  if (!release || release.draft || release.prerelease) return { available: false };
  const latestVersion = String(release.tag_name || '').replace(/^v/, '');
  if (compareVersions(latestVersion, currentVersion) <= 0) return { available: false };

  if (platform !== 'darwin') {
    return { available: true, latestVersion, asset: null, releaseUrl: release.html_url || '' };
  }

  const asset = pickMacZipAsset(release.assets, arch);
  if (!asset?.browser_download_url) return { available: false };
  return {
    available: true,
    latestVersion,
    asset: { name: asset.name, url: asset.browser_download_url, size: asset.size || 0 },
    releaseUrl: release.html_url || '',
  };
}

// 起動中の .app のパスを実行ファイルのパスから求める(.../Water Voice.app/Contents/MacOS/Water Voice)。
function getAppBundlePath(execPath) {
  const match = String(execPath || '').match(/^(.*?\.app)\/Contents\/MacOS\/[^/]+$/);
  return match ? match[1] : null;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

// 旧プロセスの終了を待ってから .app を入れ替えて再起動するシェルスクリプト。
// 失敗したら退避しておいた旧版に戻す。
function buildInstallScript({ pid, newAppPath, targetAppPath, logPath }) {
  const target = shellQuote(targetAppPath);
  const backup = shellQuote(`${targetAppPath}.old`);
  const source = shellQuote(newAppPath);
  const log = shellQuote(logPath);
  return [
    '#!/bin/sh',
    `exec >> ${log} 2>&1`,
    `echo "[$(date)] update start"`,
    `while kill -0 ${Number(pid)} 2>/dev/null; do sleep 0.2; done`,
    `rm -rf ${backup}`,
    `if ! mv ${target} ${backup}; then echo "move failed"; open ${target}; exit 1; fi`,
    `if ! ditto ${source} ${target}; then echo "copy failed, rollback"; rm -rf ${target}; mv ${backup} ${target}; open ${target}; exit 1; fi`,
    `xattr -cr ${target} 2>/dev/null`,
    `rm -rf ${backup}`,
    `echo "[$(date)] update done"`,
    `open ${target}`,
  ].join('\n');
}

module.exports = {
  RELEASES_LATEST_URL,
  parseVersion,
  compareVersions,
  pickMacZipAsset,
  resolveUpdate,
  getAppBundlePath,
  buildInstallScript,
};
