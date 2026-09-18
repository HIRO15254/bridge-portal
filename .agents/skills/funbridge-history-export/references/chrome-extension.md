# Chrome拡張機能

ユーザー自身がChromeから全履歴を保存する手段は、単体リポジトリ [HIRO15254/funbridge-history-exporter](https://github.com/HIRO15254/funbridge-history-exporter) のManifest V3拡張機能である。このリポジトリには同梱しない。

拡張機能はChrome DevTools Protocolの `Network` イベントで実通信を1回観測し、そのタブのJavaScript実行環境から許可済みの読み取りAPIだけを呼ぶ。許可するエンドポイント、権限、認証情報をservice workerのメモリー内だけで扱う境界は、このスキルが記す内容と同じである。インストール手順、操作手順、出力仕様、検証コマンドは拡張機能リポジトリのREADMEと `docs/pbn-format.md` に置く。

## 出力形式の違い

拡張機能は**PBN 2.1**を出力する。大会1件につき1ファイルで、1ボードが1ゲームである。

- 履歴索引ファイルは作らない。登録人数、獲得Bridge Points、Series期間、進行状態などの索引由来の情報は、各大会のPBNタグへ畳み込む。
- 結果APIが応答しない大会はファイルを合成せず、拡張機能の完了表示に件数と理由が出る。
- PBNの必須タグに収まらない情報は `Funbridge` 接頭辞の補助タグに入る。契約分布は `FunbridgeContractGroups` に全行が入る。

このスキル自身の出力は引き続きJSON Schema準拠のJSONである。Bridge Portalの `/api/imports/funbridge-json` はそのJSONを受け取る。拡張機能が出したPBNをそのまま同じ取込口へ渡すことはできない。PBNは `packages/domain` の `parsePbn` が読めるタグ構成で書かれており、ボードのPBN書き出し（`GET /api/boards/:id/pbn`）と同じ `Funbridge*` タグ語彙を共有する。

## 更新時の確認

FunbridgeのAPIが変わった場合は、実通信を再観測し、このスキルの `references/network-responses.md`・`references/schema-interpretation.md` と拡張機能リポジトリの `extension/lib/protocol.js` を同時に更新する。拡張機能側の検証は当該リポジトリで `npm test` と `npm run check` を実行する。
