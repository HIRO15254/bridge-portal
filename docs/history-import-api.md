# 履歴データ投入 API

`POST /api/v1/imports/funbridge-json` は、Funbridge の履歴エクスポートを
Bridge Portal に投入するサーバー間 API です。既存のブラウザ画面の取込と同じ
検証・重複検知・R2/D1 保存パイプラインを使用します。

## ブラウザ認証と認可

AWS SSO と同様に、投入元へ共有の Worker Secret を配る方式にはしません。
まず Portal にブラウザでログインし、サイドバーの **API tokens** を開いて
「アクセストークンを発行」を選びます。表示される値は一度だけです。

発行された Bearer トークンは履歴投入だけを許可し、発行したログインアカウントに
自動的に紐付きます。リクエストからユーザー ID を指定することはできません。トークンは
12 時間で失効するため、失効後はブラウザで再認証して新しい値を発行してください。

画面はログイン済み Cookie を使って内部の `POST /api/v1/import-tokens` を呼び、
`{ "accessToken": "…", "expiresAt": "…" }` を一度だけ受け取ります。この発行 API は
Cookie のない呼び出しには `401 { "error": "UNAUTHORIZED" }`、空または 100 文字超の
ラベルには `400 { "error": "INVALID_TOKEN_LABEL" }` を返します。外部ツールはこの発行
API へパスワードを送らず、必ずブラウザ画面を使ってください。

トークンは OS の認証情報ストアなど安全な保存先に置き、ソース、`.env`、エクスポート
JSON、ログ、共有チャンネルには保存しません。漏えいが疑われる場合は、失効を待たず
新しいトークンへ切り替えてください。

## Skill と Chrome 拡張機能からの投入

どちらも本番 API `https://bridge-portal-api.hiro15254.workers.dev` だけへ投入します。
Portal の **API tokens** 画面で発行した値を、実行中だけ渡してください。

Skill でローカルに生成済みの全履歴を投入するには、次の環境変数を設定してから実行
します。トークンをコマンド引数へ渡したり、ファイルへ書き込んだりしません。

```powershell
$env:BRIDGE_PORTAL_HISTORY_ACCESS_TOKEN = "ブラウザで発行した値"
node .agents/skills/funbridge-history-export/scripts/upload-to-portal.mjs funbridge-export
```

Chrome 拡張機能では、Funbridge の認証済み通信を検出して「取得準備完了」にした後、
同じ画面の **Bridge Portal** にトークンを貼り付け、「全履歴をPortalへ投入」を選びます。
トークンはポップアップと service worker の実行中メモリーだけに保持され、Chrome
ストレージ、ダウンロード、ログには保存されません。

各 JSON は個別に送信されます。同じアカウントが同じ本文を再送すると `duplicate: true`
として成功扱いになり、新しい履歴リビジョンは作成されません。ネットワークエラーと
408、429、5xx は最大 3 回（500 ms、1 秒の待機）再試行します。401、入力検証エラー、
413 は再試行せず、エラーを表示して停止します。401 の場合は Portal で再認証し、新しい
トークンを発行して失敗した投入をやり直してください。

## リクエスト

```sh
curl -X POST "https://bridge-portal-api.hiro15254.workers.dev/api/v1/imports/funbridge-json" \
  -H "Authorization: Bearer $BRIDGE_PORTAL_HISTORY_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @funbridge-export/daily/history-index-2026-09-16.json
```

本文は `FUNBRIDGE_EXPORT` v1（大会詳細）または
`FUNBRIDGE_HISTORY_INDEX` v1（履歴索引）の JSON オブジェクトそのものです。
ラッパーオブジェクトや配列は受け付けません。本文の上限は 10 MiB です。

大会詳細で JSON に `heroSeat` がないボードの席を確定したい場合だけ、`N`、`E`、
`S`、`W` のいずれかを `X-Bridge-Portal-Hero-Seat` ヘッダーに指定できます。指定が
なくても投入は可能ですが、該当ボードには
`HERO_SEAT_CONFIRMATION_REQUIRED` 警告が返ります。

入力形式の完全な定義は [Funbridge履歴エクスポート形式](./funbridge-export-format.md)
とリンク先の JSON Schema です。API は加えて、各ハンドが 13 枚、全体で重複のない
52 枚であること、auction/play の連番・seat 順、play のトリック番号・カード所有者、
大会種別ごとの必須メタデータを検証します。

## レスポンス

初回投入は `201 Created` です。履歴索引なら次を返します。

```json
{
  "duplicate": false,
  "importRevisionId": "…",
  "kind": "HISTORY_INDEX",
  "rowCount": 42
}
```

大会詳細では `tournamentId`、`revisionNumber`、`warnings` も返します。同じ登録
アカウントに同一 SHA-256 の本文を再送すると、新たなリビジョンを作らず `200 OK` と
`duplicate: true` を返します。

| HTTP status | `error` | 意味 |
| --- | --- | --- |
| 400 | `INVALID_FILE` | 本文が空、または 10 MiB を超過 |
| 400 | `INVALID_FUNBRIDGE_JSON` | JSON 構文、形式、またはブリッジデータの検証に失敗 |
| 400 | `INVALID_HERO_SEAT` | Hero seat ヘッダーが `N` / `E` / `S` / `W` 以外 |
| 401 | `UNAUTHORIZED` | Bearer トークンがない、または一致しない |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | `Content-Type: application/json` ではない |
| 500 | `INTERNAL_SERVER_ERROR` | 保存処理中の予期しない失敗 |

失敗した保存は、作成途中の D1 レコードと R2 オブジェクトを削除してから 500 を返します。
