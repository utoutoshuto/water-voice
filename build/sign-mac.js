// electron-builder の afterPack フック。固定の自己署名証明書で .app に署名する。
// 証明書が同じなら macOS はアップデート後も同じアプリとして扱い、マイク等の許可が維持される。
// 証明書が見つからない環境では ad-hoc 署名にフォールバックする。
const { execFileSync } = require('child_process');
const path = require('path');

const DEFAULT_IDENTITY = 'Water Voice Code Signing';

function findIdentity() {
  const wanted = process.env.WV_SIGN_IDENTITY || DEFAULT_IDENTITY;
  const args = ['find-identity', '-p', 'codesigning'];
  if (process.env.WV_SIGN_KEYCHAIN) args.push(process.env.WV_SIGN_KEYCHAIN);
  try {
    const output = execFileSync('security', args, { encoding: 'utf8' });
    return output.includes(`"${wanted}"`) ? wanted : null;
  } catch {
    return null;
  }
}

exports.default = async function signMac(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const identity = findIdentity();
  if (!identity) {
    console.warn(`  • 署名用証明書「${DEFAULT_IDENTITY}」が見つからないため ad-hoc 署名します(アップデートで権限が外れます)`);
  }

  const args = [
    '--force',
    '--deep',
    '--sign', identity || '-',
    '--entitlements', path.join(__dirname, '..', 'entitlements.mac.plist'),
  ];
  if (identity && process.env.WV_SIGN_KEYCHAIN) args.push('--keychain', process.env.WV_SIGN_KEYCHAIN);

  execFileSync('codesign', [...args, appPath], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
  console.log(`  • signed ${path.basename(appPath)} with ${identity || 'ad-hoc'}`);
};
