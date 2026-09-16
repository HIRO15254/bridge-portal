# Chrome拡張機能

`assets/chrome-extension/` は、Funbridge Webへログイン済みのChromeタブから全履歴を取得するManifest V3拡張機能である。Chrome DevTools Protocolの `Network` イベントで実通信を1回観測し、そのタブのJavaScript実行環境から許可済みの読み取りAPIだけを呼ぶ。整形済みJSONはローカル保存のほか、本番Bridge Portalへ直接投入できる。

## インストール

1. Chromeで `chrome://extensions` を開く。
2. 「デベロッパー モード」を有効にする。
3. 「パッケージ化されていない拡張機能を読み込む」で `assets/chrome-extension/` を選ぶ。
4. Funbridge Webへログインし、そのタブを表示したまま拡張機能を開く。

## 使い方

1. 「通信を検出」を押す。Chromeがデバッガー接続中であることを表示するのは正常である。
2. 同じFunbridgeタブで履歴または大会結果を1回開く。拡張機能が許可済みAPIのURLとAuthorizationヘッダーを検出する。
3. 「取得準備完了」になったら、ローカル保存では「全履歴をJSONで保存」を押す。
4. Portalへ投入する場合は **Portalに接続** を押す。開いたPortal画面でログインし、表示された短い認証コードを承認してから「全履歴をPortalへ投入」を押す。
5. 取得または投入後に「接続を解除」を押す。タブを閉じた場合も接続とメモリー内の認証情報は破棄される。

本人の数字IDはレスポンスから自動検出する。検出できない場合だけ入力欄へ指定する。パスワード、Cookie、Authorizationヘッダーを入力・保存する必要はない。

Portalアクセストークンは端末認可の承認後に service worker の実行中メモリーだけへ渡され、`chrome.storage`、ダウンロード、consoleへ書き込まない。拡張機能は本番 API `https://bridge-portal-api.hiro15254.workers.dev` のみにアクセスできる。401 はトークンが無効または失効していることを示すため、もう一度 **Portalに接続** して承認してから、失敗した投入を再実行する。

## 出力と投入

Chromeのダウンロード先に `funbridge-export/` 以下のJSONを保存する。

- `bp-circuit/`、`series/`、`daily/` に各ファミリーの履歴索引を保存する。`schemas/history-index.schema.json` に準拠する。
- 結果が提供される各大会を1ファイルで保存する。`schemas/tournament.schema.json` に準拠する。
- API取得不能の大会はファイルを合成せず、完了表示の取得不能件数へ含める。
- 生レスポンス、中間capture、他プレイヤーの個別順位、認証情報は保存しない。

同名ファイルは上書きする。ファイル名は取得日または大会日とsource tournament IDを使い、別大会を同じ名前にまとめない。

Portal投入では各JSONを個別に送る。同じPortalアカウントから同一本文を再送したときは `duplicate: true` の成功としてスキップされ、新しいリビジョンは作成されない。ネットワークエラーと408、429、5xxは最大3回（500 ms、1秒の待機）再試行する。401、413、入力検証エラーは再試行せず、そのファイルで停止する。必要に応じてトークンを再発行し、失敗した投入を最初からやり直す。

## 権限と境界

- `debugger`: 選択中のFunbridgeタブのNetworkイベント観測と、そのタブ内での読み取りAPI実行に使用する。
- `activeTab`: ユーザーが拡張機能を開いたFunbridgeタブを選ぶために使用する。
- `downloads`: 整形済みJSONをローカルへ保存するために使用する。
- host permissionは `*.funbridge.com`、`*.funbridge.net`、本番Portal API `bridge-portal-api.hiro15254.workers.dev` に限定する。

実行時にもURLを検証し、Funbridgeでは `/funbridge-server-ws/rest/` 以下のスキルで確認済みの7エンドポイント以外を拒否する。Portalでは固定した本番の履歴投入エンドポイントだけを使用する。FunbridgeのAuthorizationヘッダーとPortalアクセストークンはservice workerの変数だけに保持し、`chrome.storage`、ダウンロード、consoleへ書き込まない。

## 更新時の検証

リポジトリルートから次を実行する。

```sh
node .agents/skills/funbridge-history-export/scripts/verify-chrome-extension.mjs
```

この検証はmanifestの権限・参照ファイル、APIのallowlist、Portal投入の重複・通信失敗時の再試行、匿名fixtureから生成した履歴索引と大会ファイルのJSON Schema適合を確認する。Funbridgeの非公開APIが変わった場合は、実通信を再観測してfixture・抽出器・解釈資料を同時に更新する。
