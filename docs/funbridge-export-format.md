# Funbridge履歴エクスポート形式

このワークスペースのFunbridge履歴出力は、認証済みWeb版で観測したAPIを同じセッションから読み取り専用で呼び、必要な情報だけを正規化する。DOMは最初のAPI発見・ID照合・画面値比較に用いる。Funbridge公式仕様ではない。**構造の正本はスキル同梱のJSON Schema**である。

- [大会Schema](../.agents/skills/funbridge-history-export/schemas/tournament.schema.json): Bridge Portalが読める `FUNBRIDGE_EXPORT` v1コアと、クレーム、契約分布、契約なしボードを保存する最小限の拡張。
- [履歴索引Schema](../.agents/skills/funbridge-history-export/schemas/history-index.schema.json): `FUNBRIDGE_HISTORY_INDEX` v1。履歴一覧で取得した大会の概要とcoverage。

スキル出力は `funbridge-export/<family>/history-index-YYYY-MM-DD.json` と `funbridge-export/<family>/YYYY-MM-DD_<source-id>.network.json` を基本とする。1大会の詳細は1ファイル。索引の全件取得と、結果の提供される大会の全プレイ済みボード取得を区別する。

## 残す情報

履歴索引は大会ID、原題、開始日時またはSeriesの最終プレイ日時、係数・期間・地域、登録人数、本人順位・スコア・獲得Bridge Points、宣言/プレイ済みボード数、進行状態のうちファミリーに実在するものを保持する。取得行数とレスポンスの総件数が一致した場合だけcoverageを `FULL` とする。

大会ファイルはsource大会・親イベント・deal/game/match ID、取得時刻・方法、大会結果、宣言/プレイ済みボード数、4ハンドとdealer/vulnerability、APIにあるauctionと実カードplay、本人ボード順位・スコア、全契約集計を保持する。契約・プレイが空でも配札を取得したボードは `partialBoards` に保存し、契約だけ既知なら `NO_PLAY`、パスアウトなら `PASSED_OUT` と区別する。KOはmatch/round/対戦者結果を `matchComparison` に置く。クレームでカードが52枚未満なら補わず `source.claimMarker` に `!S4` 等の元記号だけを残す。数字の詳細な意味は未確認でトリック数へ変換しない。

本人のボードMPや順位は `comparison` に保存する。契約分布の空契約行は内部score符号を実スコアに変換せず `unclassifiedPlayerCount` に、`PA` 行は `passedOutPlayerCount` に人数を残す。取得行数による `contractGroupCoverage` と、行の人数合計が参加人数に合うかを示す `contractGroupIntegrity` は別の検査。実レスポンスでは15ボードで±1人の不一致があり、補正せず `MISMATCH` と元人数を保存した。`3N`→`3NT`、`X1`→`X`、`X2`→`XX` と正規化し、倍増行には `sourceContract` も残す。

## 意図的に除く情報

認証ヘッダー、Cookie、HAR、レスポンス全文、通信requestId、path、アバター、契約プラン、アカウント状態、メール・プロフィール情報を出力しない。`bidList` や `playList` の生文字列、本人結果の重複コピー、上位5契約と全契約の重複、長いUI分析文、パーマトリクスも保存しない。画面由来の日付ラベルや報酬は、レスポンスにないものを推測して追加しない。

他プレイヤーの表示名とIDを含む順位行は、既定の `SUMMARY` では残さない。本人順位と全体人数は大会コアにあり、`standingsCoverage` は**保存した行**の範囲を表す。ユーザーが個別順位を求めた場合だけ `standings` を保存し、全件の一致を確認した場合だけ `FULL` にする。

## 検証と取込

`node .agents/skills/funbridge-history-export/scripts/validate-export.mjs <file-or-directory>` はDraft 2020-12のJSON SchemaをAjvで適用し、配札52枚一意、seat、アクション順序、クレーム、取得済みボード数、集計人数とその不一致の表示、coverageの相互整合性を検査する。Schema外フィールドは許可しない。認証情報を除いた観測captureから `scripts/build-tournament-from-capture.mjs` で正式大会JSONを作り、既存のv1 JSONの再投影に限って `scripts/curate-export.mjs` を使う。

現行Bridge Portalインポーターは大会ファイルの `boards` コアを受理するが、`partialBoards`、`comparison`、`matchComparison`、`source.claimMarker` 等の拡張をD1に正規化しない。元JSONは取込時にPrivate R2へ保存される。契約なし・KOボードが多い大会はD1取込時に `BOARD_COUNT_MISMATCH`、クレームで短いplayには `PLAY_INCOMPLETE` の警告があり得る。スキルSchemaの検証成功とD1での完全な検索可能性は異なる。
