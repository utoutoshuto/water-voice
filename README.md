# Water Voice

AI音声入力アプリ。話した音声をGemini APIで文字起こし・整形し、結果を前面のアプリへ自動で貼り付けます。

![Water Voice](assets/icon.png)

## Features

- グローバルホットキーで録音開始/停止
- Gemini APIによる音声認識と文章整形
- フィラーワード除去、句読点付与、段落整形
- 録音開始時に前面にあったアプリへの自動貼り付け (OFFにするとクリップボード保存と完了音)
- 貼り付け後に元のクリップボード内容を復元
- Command Mode: 選択テキストを音声の指示(「もっと簡潔に」「英訳して」など)で書き換え。未選択なら指示どおりに新規作成
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

macOSではマイク権限が必要です。自動貼り付けとCommand Modeにはアクセシビリティ権限も必要です(システム設定 > プライバシーとセキュリティ > アクセシビリティ)。権限がない場合はクリップボード保存にフォールバックし、ホーム・設定画面に案内が表示されます。

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

## Usage

1. 設定画面でGemini APIキーを入力して保存
2. ホットキーを押して録音開始
3. 話す
4. もう一度ホットキーを押して録音停止
5. Geminiが整形したテキストを、録音開始時に前面にあったアプリへ貼り付ける
   - 自動貼り付けがOFF、権限がない、またはWater Voiceのウィンドウが前面だった場合は、クリップボードへ保存して完了音を鳴らす

既定ホットキーは`CommandOrControl+Shift+Space`です。
録音中に`Esc`を押すか、録音オーバーレイをクリックすると録音を破棄します。

### Command Mode

1. 書き換えたいテキストを選択する(新規作成したい場合は選択せずカーソルを置く)
2. コマンドモードのホットキー(既定`CommandOrControl+Shift+E`)を押す。オーバーレイが紫色の「コマンド」表示になる
3. 「もっと簡潔に」「英訳して」「箇条書きにして」などと指示を話す
4. もう一度ホットキーを押すと、Geminiの結果で選択範囲を置き換える(未選択なら指示どおりに作成したテキストを挿入する)

選択テキストは開始時に`Cmd/Ctrl+C`で取得し、元のクリップボード内容は取得後に復元します。自動貼り付けがOFFの場合、結果はクリップボードへ保存のみ行います。

## Settings

| 設定 | 説明 |
| --- | --- |
| APIキー | Gemini APIの認証キー |
| ホットキー | 録音開始/停止のキー |
| コマンドモードのホットキー | Command Modeの開始/停止キー。空にすると無効 |
| 前面のアプリに自動で貼り付け | 整形結果を録音開始時の前面アプリへ貼り付けるか。OFFでクリップボード保存と完了音 |
| 貼り付け後にクリップボードを復元 | 貼り付け後、少し待って元のクリップボード内容に戻すか |
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
- 自動貼り付けはmacOSではSystem Events経由の`Cmd+V`、WindowsではSendKeysによる`Ctrl+V`で行います。
- APIが混雑している場合は自動でリトライし、`gemini-2.5-flash`から`gemini-2.0-flash`へフォールバックします。
- Windowsインストーラーはインストール開始時に起動中のWater Voiceを終了します。

## License

MIT
