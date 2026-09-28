module.exports = {
  appId: 'com.water-voice.app',
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
    // CSC_NAME がなければ ad-hoc 署名にして、署名 identity を毎回変えない。
    identity: process.env.CSC_NAME || '-',
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
  files: [
    'dist/**/*',
    'main.js',
    'preload.js',
    'assets/**/*',
    'src/shared/**/*',
  ],
};
