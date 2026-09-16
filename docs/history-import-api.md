# 履歴データ投入 API

`POST /api/v1/imports/funbridge-json` は、Funbridge の履歴エクスポートを
Bridge Portal に投入するサーバー間 API です。既存のブラウザ画面の取込と同じ
検証・重複検知・R2/D1 保存パイプラインを使用します。

## ブラウザ認証と認可

AWS SSO と同様に、投入元へ共有の Worker Secret を配る方式にはしません。
Skill と拡張機能は AWS SSO と同様の端末認可フローを使います。端末側で短い
認証コードと Portal のURLを表示し、Portalにブラウザでログインした利用者が承認します。
端末は承認を待機してから、履歴投入だけを許可する短命のBearerトークンを取得します。

発行された Bearer トークンは履歴投入だけを許可し、発行したログインアカウントに
自動的に紐付きます。リクエストからユーザー ID を指定することはできません。トークンは
12 時間で失効するため、失効後はブラウザで再認証して新しい値を発行してください。

端末認可は `POST /api/v1/device-authorizations` で開始し、10分有効の `deviceCode` と
`userCode` を返します。ブラウザはログイン済みCookieで
`POST /api/v1/device-authorizations/approve` を呼びます。端末は
`POST /api/v1/device-authorizations/token` を2秒ごとに確認し、承認前は
`428 { "error": "AUTHORIZATION_PENDING" }`、承認後はBearerトークンを受け取ります。
ユーザーはパスワードや長いトークンを端末へコピーしません。

トークンは OS の認証情報ストアなど安全な保存先に置き、ソース、`.env`、エクスポート
JSON、ログ、共有チャンネルには保存しません。漏えいが疑われる場合は、失効を待たず
新しいトークンへ切り替えてください。

## Skill と Chrome 拡張機能からの投入

どちらも本番 API `https://bridge-portal-api.hiro15254.workers.dev` だけへ投入します。
Portal の **API tokens** 画面で発行した値を、実行中だけ渡してください。

Skill でローカルに生成済みの全履歴を投入するには、次を実行します。表示されたURLを
ブラウザで開いて認証コードを承認します。トークンをコマンド引数・環境変数・ファイルへ
渡しません。

```powershell
node .agents/skills/funbridge-history-export/scripts/upload-to-portal.mjs funbridge-export
```

Chrome 拡張機能では、Funbridge の認証済み通信を検出して「取得準備完了」にした後、
**Portalに接続** を選びます。Portalの承認画面が開くため、ログインして短いコードを承認
したら「全履歴をPortalへ投入」を選びます。トークンはservice workerの実行中メモリーだけに
保持され、Chromeストレージ、ダウンロード、ログには保存されません。

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
