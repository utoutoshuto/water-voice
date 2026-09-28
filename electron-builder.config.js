module.exports = {
  appId: 'com.water-voice.app',
  afterPack: './build/sign-mac.js',
  productName: 'Water Voice',
  directories: {
    output: 'release',
  },
  mac: {
    icon: 'assets/icon.png',
    category: 'public.app-category.productivity',
    entitlements: 'entitlements.mac.plist',
    entitlementsInherit: 'entitlements.mac.plist',
    hardenedRuntime: false,
    gatekeeperAssess: false,
    // 署名は build/sign-mac.js (afterPack) で固定の自己署名証明書を使って行う。
    // electron-builder は自己署名証明書を有効な identity として扱わないため、ここでは署名しない。
    identity: null,
    target: ['dmg', 'zip'],
    extendInfo: {
      NSMicrophoneUsageDescription: '音声入力のためにマイクへのアクセスが必要です。',
      NSAppleEventsUsageDescription: 'テキスト挿入のためにAppleScriptが必要です。',
      LSUIElement: true,
    },
  },
  win: {
    icon: 'assets/icon.png',
    target: ['nsis', 'zip'],
  },
  nsis: {
    oneClick: true,
    deleteAppDataOnUninstall: false,
    include: 'build/installer.nsh',
  },
  // 自動更新用の公開先情報。Release 作成自体は .github/workflows/release.yml が行う
  publish: {
    provider: 'github',
    owner: 'utoutoshuto',
    repo: 'water-voice',
    releaseType: 'release',
  },
  files: [
    'dist/**/*',
    'main.js',
    'preload.js',
    'updater.js',
    'assets/**/*',
    'src/shared/**/*',
  ],
};
