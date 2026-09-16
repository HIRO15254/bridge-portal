# Chrome拡張機能

`assets/chrome-extension/` は、Funbridge Webへログイン済みのChromeタブから全履歴を取得するManifest V3拡張機能である。Chrome DevTools Protocolの `Network` イベントで実通信を1回観測し、そのタブのJavaScript実行環境から許可済みの読み取りAPIだけを呼ぶ。

## インストール

1. Chromeで `chrome://extensions` を開く。
2. 「デベロッパー モード」を有効にする。
3. 「パッケージ化されていない拡張機能を読み込む」で `assets/chrome-extension/` を選ぶ。
4. Funbridge Webへログインし、そのタブを表示したまま拡張機能を開く。

## 使い方

1. 「通信を検出」を押す。Chromeがデバッガー接続中であることを表示するのは正常である。
2. 同じFunbridgeタブで履歴または大会結果を1回開く。拡張機能が許可済みAPIのURLとAuthorizationヘッダーを検出する。
3. 「取得準備完了」になったら「全履歴を保存」を押す。
4. 取得後に「接続を解除」を押す。タブを閉じた場合も接続とメモリー内の認証情報は破棄される。

本人の数字IDはレスポンスから自動検出する。検出できない場合だけ入力欄へ指定する。パスワード、Cookie、Authorizationヘッダーを入力・保存する必要はない。

## 出力

Chromeのダウンロード先に `funbridge-export/` 以下のJSONを保存する。

- `bp-circuit/`、`series/`、`daily/` に各ファミリーの履歴索引を保存する。`schemas/history-index.schema.json` に準拠する。
- 結果が提供される各大会を1ファイルで保存する。`schemas/tournament.schema.json` に準拠する。
- API取得不能の大会はファイルを合成せず、完了表示の取得不能件数へ含める。
- 生レスポンス、中間capture、他プレイヤーの個別順位、認証情報は保存しない。

同名ファイルは上書きする。ファイル名は取得日または大会日とsource tournament IDを使い、別大会を同じ名前にまとめない。

## 権限と境界

- `debugger`: 選択中のFunbridgeタブのNetworkイベント観測と、そのタブ内での読み取りAPI実行に使用する。
- `activeTab`: ユーザーが拡張機能を開いたFunbridgeタブを選ぶために使用する。
- `downloads`: 整形済みJSONをローカルへ保存するために使用する。
- host permissionは `*.funbridge.com` と `*.funbridge.net` に限定する。

実行時にもURLを検証し、`/funbridge-server-ws/rest/` 以下のスキルで確認済みの7エンドポイント以外は拒否する。Authorizationヘッダーはservice workerの変数だけに保持し、`chrome.storage`、ダウンロード、consoleへ書き込まない。

## 更新時の検証

リポジトリルートから次を実行する。

```sh
node .agents/skills/funbridge-history-export/scripts/verify-chrome-extension.mjs
```

この検証はmanifestの権限・参照ファイル、APIのallowlist、匿名fixtureから生成した履歴索引と大会ファイルのJSON Schema適合を確認する。Funbridgeの非公開APIが変わった場合は、実通信を再観測してfixture・抽出器・解釈資料を同時に更新する。
