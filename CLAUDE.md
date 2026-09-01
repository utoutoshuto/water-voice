# water-voice

## ビルド・デプロイ手順

`main.js` / `src/` 配下のコードを変更した場合、変更をインストール済みアプリに反映するには以下の手順を実施すること。単に `npm run build` するだけでは `dist/` が更新されるだけで、`/Applications/Water Voice.app` は古いままなので必ず一連の手順を最後まで行う。

1. 稼働中の旧バージョンを終了する
   - `LSUIElement: true` のメニューバーアプリのため、通常の `quit` イベントが効かないことがある。その場合は強制終了する。
     ```
     pkill -9 -f "Water Voice"
     ```
2. ビルド＆パッケージ化する
   ```
   npm run dist
   ```
   (`npm run build` でwebpackビルド → `electron-builder` で `release/mac-arm64/Water Voice.app` を生成)
3. `/Applications` に上書きインストールする
   ```
   rm -rf "/Applications/Water Voice.app"
   cp -R "/Users/utouto/works/water-voice/release/mac-arm64/Water Voice.app" "/Applications/"
   ```
4. 起動する
   ```
   open "/Applications/Water Voice.app"
   ```

上書き・強制終了は破壊的操作だが、このリポジトリでの開発フローとして常に許可されている。都度の確認は不要。
