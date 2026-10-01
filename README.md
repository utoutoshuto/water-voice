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

## Install

[Releases](https://github.com/utoutoshuto/water-voice/releases/latest) から最新版をダウンロードしてください。

### macOS (Apple Silicon)

1. `Water.Voice-<version>-arm64.dmg` を開き、Water Voice を Applications フォルダへドラッグ
2. 公証(notarization)していないため、初回起動前にターミナルで隔離属性を外す

   ```bash
   xattr -cr "/Applications/Water Voice.app"
   ```

3. 起動するとメニューバーに常駐します。マイクの許可ダイアログで「許可」を選択
4. 自動貼り付けを使う場合は、システム設定 > プライバシーとセキュリティ > アクセシビリティ で Water Voice を ON

#### 自動アップデート

v1.4.1 以降は、起動時に GitHub の最新リリースを確認し、新しい版があれば自動でダウンロード・入れ替え・再起動します（設定 > アップデート で OFF にできます）。

- ダウンロードした版が同じ証明書で署名されていることを確認してから入れ替えます
- 同じ証明書で署名し続けるため、アップデート後もマイク/アクセシビリティの許可は維持されます
- v1.4.0 以前からは自動では上がりません。v1.4.1 だけは上記の手順で手動インストールしてください（署名が変わるため、マイク/アクセシビリティの許可も一度だけやり直しが必要です）
- 経過は `~/Library/Application Support/Water Voice/update.log` に記録されます

### Windows

`Water.Voice.Setup.<version>.exe` を実行してください。未署名のため SmartScreen の警告が出た場合は「詳細情報」→「実行」を選択します。Windows 版は起動時に新しい版があると通知し、クリックでダウンロードページを開きます。

## Release

`package.json` の version を上げてタグを push すると、GitHub Actions が macOS / Windows 版をビルドして Releases に公開します。

```bash
git tag v1.4.0
git push origin v1.4.0
```

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

### macOSの署名

macOS はマイク・アクセシビリティの許可（TCC）を署名の証明書にひも付けて記録します。ビルドごとに署名が変わると別アプリ扱いになり、許可が外れ、自動アップデートの署名検証も通りません。そのため、固定の自己署名証明書「Water Voice Code Signing」で署名しています。

- 署名は `build/sign-mac.js`（electron-builder の `afterPack`）が行います。キーチェーンに「Water Voice Code Signing」があればそれで署名し、なければ ad-hoc 署名にフォールバックします
- GitHub Actions では Secrets の `WV_SIGN_P12`（p12 を base64 化したもの）と `WV_SIGN_P12_PASSWORD` から一時キーチェーンに取り込んで署名します
- 証明書の実体は開発者の Mac のログインキーチェーンにあります。別の Mac でビルドする場合は、キーチェーンアクセスから「Water Voice Code Signing」を p12 で書き出して取り込んでください

**証明書を作り直すと、既存ユーザーは自動アップデートできなくなります**（署名検証で弾かれるため手動で入れ直しが必要）。証明書は失くさないよう保管してください。

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
