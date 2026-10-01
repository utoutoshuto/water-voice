// 起動時に GitHub Releases を確認し、新しい版があれば macOS では自動でダウンロード・入れ替え・再起動する。
// Windows は新しい版の通知だけ行い、クリックでダウンロードページを開く。
const { app, net, Notification, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');
const {
  RELEASES_LATEST_URL,
  resolveUpdate,
  getAppBundlePath,
  buildInstallScript,
} = require('./src/shared/updateCore');

const IDLE_POLL_MS = 5000;

// 更新処理の経過をユーザーデータ配下の update.log に残す(トラブル時の調査用)
function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'update.log'), line);
  } catch {
    // ログ書き込み失敗は無視
  }
}

function run(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

function notify(title, body, onClick) {
  if (!Notification.isSupported()) return;
  const notification = new Notification({ title, body });
  if (onClick) notification.on('click', onClick);
  notification.show();
}

async function fetchLatestRelease() {
  // WATER_VOICE_UPDATE_FEED は動作確認用に確認先を差し替えるためのもの
  const feedUrl = process.env.WATER_VOICE_UPDATE_FEED || RELEASES_LATEST_URL;
  const response = await net.fetch(feedUrl, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'water-voice-updater' },
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status}`);
  return response.json();
}

async function download(url, destination) {
  const response = await net.fetch(url, { headers: { 'User-Agent': 'water-voice-updater' } });
  if (!response.ok) throw new Error(`download ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destination, buffer);
}

// 起動中のアプリの署名要件(designated requirement)を取得する。ad-hoc 署名(cdhash 固定)なら null。
async function getDesignatedRequirement(appPath) {
  const { ok, stdout, stderr } = await run('codesign', ['-d', '-r-', appPath]);
  if (!ok) return null;
  const match = `${stdout}\n${stderr}`.match(/designated => (.+)/);
  if (!match || /cdhash/.test(match[1])) return null;
  return match[1].trim();
}

// ダウンロードした版が、起動中の版と同じ証明書で署名されていることを確認する。
async function verifySameSigner(newAppPath, requirement) {
  const deep = await run('codesign', ['--verify', '--deep', '--strict', newAppPath]);
  if (!deep.ok) return false;
  const same = await run('codesign', ['--verify', `-R=${requirement}`, newAppPath]);
  return same.ok;
}

async function prepareMacUpdate(update, targetAppPath) {
  const requirement = await getDesignatedRequirement(targetAppPath);
  if (!requirement) {
    throw new Error('起動中のアプリが固定の証明書で署名されていないため、自動更新できません。');
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'water-voice-update-'));
  const zipPath = path.join(workDir, update.asset.name);
  await download(update.asset.url, zipPath);

  const extractDir = path.join(workDir, 'extracted');
  const unzip = await run('ditto', ['-x', '-k', zipPath, extractDir]);
  if (!unzip.ok) throw new Error(`展開に失敗しました: ${unzip.stderr}`);

  const bundleName = fs.readdirSync(extractDir).find((name) => name.endsWith('.app'));
  if (!bundleName) throw new Error('更新ファイルにアプリが含まれていません。');
  const newAppPath = path.join(extractDir, bundleName);

  if (!(await verifySameSigner(newAppPath, requirement))) {
    throw new Error('更新ファイルの署名が一致しないため、更新を中止しました。');
  }
  return { workDir, newAppPath };
}

function installAndRelaunch({ workDir, newAppPath, targetAppPath, beforeQuit }) {
  const scriptPath = path.join(workDir, 'install.sh');
  const logPath = path.join(app.getPath('userData'), 'update.log');
  fs.writeFileSync(scriptPath, buildInstallScript({
    pid: process.pid,
    newAppPath,
    targetAppPath,
    logPath,
  }), { mode: 0o755 });

  const child = spawn('/bin/sh', [scriptPath], { detached: true, stdio: 'ignore' });
  child.unref();
  beforeQuit?.();
  app.quit();
}

function waitUntil(predicate) {
  return new Promise((resolve) => {
    const check = () => (predicate() ? resolve() : setTimeout(check, IDLE_POLL_MS));
    check();
  });
}

/**
 * 起動時に 1 回だけ更新を確認する。
 * @param {object} options
 * @param {() => boolean} options.isIdle 録音・整形中でなければ true
 * @param {() => void} options.beforeQuit 終了前に呼ぶ(ウィンドウの close 抑止解除など)
 * @param {(state: object) => void} options.onStatus 状態変化の通知
 */
async function checkForUpdatesOnStartup({ isIdle, beforeQuit, onStatus = () => {} }) {
  if (!app.isPackaged) return;

  try {
    onStatus({ state: 'checking' });
    log(`check start (current v${app.getVersion()})`);
    const update = resolveUpdate({
      release: await fetchLatestRelease(),
      currentVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
    });

    log(`check result: ${JSON.stringify(update)}`);
    if (!update.available) {
      onStatus({ state: 'latest' });
      return;
    }

    if (process.platform !== 'darwin') {
      onStatus({ state: 'available', version: update.latestVersion });
      notify('Water Voice の新しいバージョンがあります', `v${update.latestVersion} をダウンロードできます。`, () => {
        shell.openExternal(update.releaseUrl);
      });
      return;
    }

    const targetAppPath = getAppBundlePath(process.execPath);
    if (!targetAppPath) throw new Error('アプリの場所を特定できませんでした。');

    onStatus({ state: 'downloading', version: update.latestVersion });
    const prepared = await prepareMacUpdate(update, targetAppPath);
    log(`downloaded and verified: ${prepared.newAppPath}`);

    // 録音・整形中に再起動しないよう、アイドルになるまで待ってから入れ替える
    await waitUntil(isIdle);
    onStatus({ state: 'installing', version: update.latestVersion });
    installAndRelaunch({ ...prepared, targetAppPath, beforeQuit });
  } catch (error) {
    console.error('Auto update failed:', error);
    log(`failed: ${error.stack || error.message}`);
    onStatus({ state: 'error', error: error.message });
  }
}

module.exports = { checkForUpdatesOnStartup };
