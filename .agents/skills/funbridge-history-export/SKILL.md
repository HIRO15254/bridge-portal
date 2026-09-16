---
name: funbridge-history-export
description: Funbridge Web版の認証済みSPAで発生したネットワークレスポンスからBP Circuit、Series Tournament、Daily Tournamentの履歴とボード結果を取得し、必要なデータだけをJSON Schema準拠のBridge Portal互換JSONとして出力する。過去ハンド、本人結果、契約分布の保存に使用する。
---

# Funbridge History Export

Funbridgeの認証済みWeb版で履歴APIの実リクエスト・レスポンスを一度観測し、その後は同じブラウザーの認証で履歴・結果を読み取り専用APIコールから取得する。必要なフィールドだけを `FUNBRIDGE_EXPORT` v1 と `FUNBRIDGE_HISTORY_INDEX` v1 に整形する。DOMはAPIの発見・ID対応・表示値との照合に使い、全大会・全ボードを巡るための必須手段にはしない。内部APIは非公開で変更され得るため、観測したrequest shapeと画面の対象IDを毎セッション確認する。

## 最初に読む資料

- 出力を書く前に [schemas/tournament.schema.json](schemas/tournament.schema.json)、[schemas/history-index.schema.json](schemas/history-index.schema.json) と [../../../docs/funbridge-export-format.md](../../../docs/funbridge-export-format.md) を読む。Schemaが出力構造の正本である。
- レスポンスを収集するときは [references/network-responses.md](references/network-responses.md)、[references/capture-shape.md](references/capture-shape.md)、[references/schema-interpretation.md](references/schema-interpretation.md) を読む。後者に2026-09-15の全履歴実測値と型の解釈を記す。
- レスポンスにない情報を画面から補完するときは [references/browser-extraction.md](references/browser-extraction.md) を読む。
- ユーザー自身がChromeから全履歴を保存するときは、同梱のManifest V3拡張機能と [references/chrome-extension.md](references/chrome-extension.md) を使う。

## ブラウザーと認証

ChatGPT内ブラウザーまたはユーザーが指定したブラウザーを使う。認証情報、パスワードマネージャー、CAPTCHAは操作せず、必要ならログインだけユーザーへ引き継ぐ。

再利用可能なユーザー実行手段が必要な場合は `assets/chrome-extension/` をChromeへ読み込む。拡張機能は `chrome.debugger` で選択中タブの実通信を観測し、認証情報をservice workerのメモリー内だけで使う。生レスポンスは保存せず、2つのSchemaに準拠するJSONだけをダウンロードする。

FunbridgeはSPAである。画面上でAPIを発見する場合は次を守る。

- ログイン後の「ホーム」を起点に、1つのタブで画面上のリンクをクリックし、対象大会と実際のPOSTパラメーターを対応付ける。
- SPA結果URLの `d` は合成・再利用しない。結果APIには履歴・大会レスポンスから得たsource IDを渡す。
- 取得途中にリロードしない。APIの読み取りコールは画面遷移を伴わず、認証済みタブ内だけから行う。
- 正常な画面遷移後に限り、現在URLとレスポンス本文のIDを対応付ける。
- 空欄、`undefined`、あり得ない初期値、停止したローダーを見たら、その値を保存せず、画面内の「ホーム」から経路を辿り直す。

## 取得範囲

依頼に範囲指定がなければ、指定された大会を取得する。「全履歴」はBP Circuit、Series、Dailyの履歴索引全行と、結果が提供される全大会・全プレイ済みボードを指す。

- 大会ヘッダー、ファミリー固有メタデータ、本人の順位・スコア・参加者数。
- プレイ済み全ボードの4ハンド、dealer、vulnerability、APIに存在するauction・実カードplay、contract、declarer、tricks、本人のボード結果。
- 各ボードの「すべてのコントラクト」にある集計行と契約なし人数。上位5行が全行の部分集合なら重複保存しない。
- 大会・ボード順位表の取得範囲を示すcoverage。

他プレイヤーは2モードに分ける。

- `SUMMARY`（既定）: コントラクト集計、総人数、本人順位だけを保存する。他プレイヤーの個別順位行は出力しない。
- `FULL`: ユーザーが全順位・全プレイヤー行を求めた場合に、仮想スクロールを最後まで走査して保存する。取得した行数と総件数が一致した場合だけcoverageを `FULL` とする。

表示名、国、FunbridgeアカウントIDは結果行に表示された範囲だけを使う。プロフィールを開いて追加情報を集めない。メールアドレス、契約情報、アカウント設定は出力しない。

## API発見用の画面経路

最初の1大会でホームから経路を確認し、NetworkイベントのURL、POST本文、レスポンス、大会・deal/game IDを照合する。以降のページングは確認済みAPIを直接呼び、最後に件数を照合する。

- `BP_CIRCUIT`: 「トーナメントをプレイする」→「Bridge Points サーキット」→「履歴」→大会。
- `SERIES`: 「トーナメントをプレイする」→「シリーズトーナメント」→「あなたのトーナメントの履歴」→大会。履歴が空なら空であることを報告し、進行中大会を開始しない。
- `DAILY`: 「トーナメントをプレイする」→「デイリートーナメント」→「あなたの直近のトーナメント」→大会。結果画面が最終ボードを開くため、「ディールのリスト」から全ボードへ移動する。

`getDealResultSummary` に4ハンド、dealer、vulnerability、bidList、playList が含まれる場合はそれを採用する。リプレイは不足項目の照合に限り、「もう一度プレイする」は選ばない。KOは通常の大会結果APIでは取得できず、match APIから本人・対戦者結果を取得する。

## 収集と出力

1. 履歴に入る前にNetworkを有効化し、画面操作で発生した実POSTとレスポンスを観測する。認証ヘッダーをログ・ファイル・最終出力に保存しない。
2. 認証済みタブ内で**観測済みのFunbridge同一バックエンドだけ**に読み取り専用POSTを行う。BP Federalはcategory 20、BICは32、KOは45、Seriesは8、Dailyは6。履歴index→大会seed/played deal ID→board summary→`getResultForDeal` の順に取得する。KOはmatch一覧・match詳細を介する。実POST形と停止条件は [network-responses.md](references/network-responses.md) に記す。
3. 履歴indexの `rowCount === totalCount`、プレイ済みボード数、契約集計の行数・人数を照合する。契約集計行数が全件でも人数が1人ずれることがあるので、差を修正せず `contractGroupIntegrity: MISMATCH` と人数を保存する。`!S2` 等はカードと数えずclaimMarkerに残す。`-32000` は実スコアにしない。`PA` はパスアウトとして扱う。
4. 認証情報を除いた中間captureから `node scripts/build-tournament-from-capture.mjs <capture-root> <output-root>` で1大会1JSONに変換する。既存のv1 JSONをスキーマ項目へ再投影するときだけ `node scripts/curate-export.mjs <input.json> [output.json]` を使う。索引は `node scripts/build-archive-index.mjs` で作り、索引行と大会詳細の対応を照合する。結果のないイベントは索引のみ残し、理由を報告する。
5. `node scripts/validate-export.mjs <family-directory>` を3ファミリーに対して実行し、Schemaと52枚一意、action連番、取得済みボード数、契約分布の相互整合性を検証する。「全履歴」では `node scripts/verify-full-history.mjs <output-root>` で索引の全行・詳細ファイル・プレイ済みボードを照合し、結果なしの索引行を列挙する。最終出力に中間captureを含めない。

レスポンス本文を取得できないブラウザーでは、UIから取得した範囲を `SPA_UI` として明示する。`NETWORK_RESPONSE` や `MIXED` と表現しない。画面と出力の保持・欠損を報告する依頼では、実大会についてフィールド単位で照合し、未確認と欠損を区別する。

出力先の指定がなければ、現在のワークスペースに `funbridge-export/` を作る。既存ファイルがある場合は、同じ `tournament.id` とsource IDを照合してから更新し、無関係なファイルを上書きしない。

## 完了条件

- 履歴索引総件数、結果が提供される大会数、宣言ボード数、プレイ済みボード数が区別されている。
- 配札を取得した各ボードは4席13枚、52枚一意、取得済みauction/play indexが連続する。52枚未満のプレイは、クレーム記号があるか取得漏れか区別する。
- 取得していない順位範囲を `FULL` と表現していない。
- source tournament/deal/game ID、取得時刻、locale、取得方法と履歴索引のcoverageが保持されている。
- JSON Schemaにないフィールドや認証・アカウント情報が出力にない。
- validatorが成功し、API自体の欠損・人数不一致・進行中の未プレイボードが最終報告に明記されている。

共有、報告、ライブラリー保存、再プレイ、課金、設定変更はこのスキルの範囲外であり操作しない。
