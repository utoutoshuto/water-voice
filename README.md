# Water Voice

AI音声入力アプリ。話した音声をGemini APIで文字起こし・整形し、結果をクリップボードへ保存します。

![Water Voice](assets/icon.png)

## Features

- グローバルホットキーで録音開始/停止
- Gemini APIによる音声認識と文章整形
- フィラーワード除去、句読点付与、段落整形
- クリップボード保存と完了音
- カスタム辞書 最大800語
- 履歴 最大100件
- macOS / Windows対応
- ログイン時の自動起動
- APIキー接続確認
- Escまたは録音オーバーレイクリックで録音キャンセル

## Requirements

| 項目 | 要件 |
| --- | --- |
| OS | macOS 10.13以上 / Windows 10以上 |
| Node.js | 20以上 |
| Gemini APIキー | Google AI Studioで取得 |
| マイク | 任意の入力デバイス |

macOSではマイク権限が必要です。

## Setup

```bash
npm install
npm run dev
```

## Build

```bash
# Rendererだけをビルド
npm run build

# 配布パッケージを生成
npm run pack
```

生成物は`release/`へ出力されます。

### macOSの署名

macOSでは署名 identity が変わると、再インストール時にマイク・アクセシビリティの許可（TCC）がリセットされることがあります。開発配布でも同じ自己署名証明書を継続して使ってください。

初回だけ、ローカル署名用の自己署名証明書を作成してログインキーチェーンへ追加します。

```bash
openssl req -x509 -newkey rsa:2048 -keyout water-voice-local.key -out water-voice-local.crt \
  -days 3650 -nodes -subj '/CN=Water Voice Local' -addext 'extendedKeyUsage=codeSigning'
openssl pkcs12 -export -out water-voice-local.p12 -inkey water-voice-local.key \
  -in water-voice-local.crt -name 'Water Voice Local'
security import water-voice-local.p12 -k ~/Library/Keychains/login.keychain-db -T /usr/bin/codesign
security find-identity -v -p codesigning
rm water-voice-local.key water-voice-local.crt water-voice-local.p12
```

以後は identity 名を固定してビルドします。`CSC_NAME` を指定しない場合は ad-hoc 署名（`-`）になります。

```bash
CSC_NAME='Water Voice Local' npm run dist
```

Apple Developer の Developer ID 証明書を使う場合も、同じように `CSC_NAME` にその identity 名を指定します。

## Usage

1. 設定画面でGemini APIキーを入力して保存
2. ホットキーを押して録音開始
3. 話す
4. もう一度ホットキーを押して録音停止
5. Geminiが整形したテキストをクリップボードへ保存し、完了音を鳴らす

既定ホットキーは`CommandOrControl+Shift+Space`です。
録音中に`Esc`を押すか、録音オーバーレイをクリックすると録音を破棄します。

## Settings

| 設定 | 説明 |
| --- | --- |
| APIキー | Gemini APIの認証キー |
| ホットキー | 録音開始/停止のキー |
| 言語 | 音声認識に使う言語 |
| フィラーワード除去 | 「えー」「あー」などを削除するか |
| ログイン時に自動起動 | OS起動時にアプリを起動するか |
| カスタム辞書 | 固有名詞や専門用語の優先語 |

## Project Structure

```text
water-voice/
├── main.js
├── preload.js
├── src/
│   ├── App.jsx
│   ├── renderer.jsx
│   ├── pages/
│   │   ├── Home.jsx
│   │   ├── Settings.jsx
│   │   ├── History.jsx
│   │   ├── Dictionary.jsx
│   │   └── Overlay.jsx
│   └── styles/
│       └── global.css
├── assets/
├── entitlements.mac.plist
└── webpack.config.js
```

## Notes

- 既存の設定キーと履歴形式は維持しています。
- 開発環境はNode.js 20系を推奨します。`.nvmrc`とVolta設定を同梱しています。
- 自動貼り付けは行いません。整形済みテキストはクリップボードへ保存されます。
- APIが混雑している場合は自動でリトライし、`gemini-2.5-flash`から`gemini-2.0-flash`へフォールバックします。
- Windowsインストーラーはインストール開始時に起動中のWater Voiceを終了します。

## License

MIT
