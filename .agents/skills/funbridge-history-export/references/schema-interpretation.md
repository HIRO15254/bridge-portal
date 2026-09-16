# Funbridgeレスポンスの実測解釈（2026-09-15）

この資料は認証済みFunbridge Webで実際に得たBP Circuit 60件、Series 3件、Daily 6件の履歴、結果のある68大会、684プレイ済みボードを根拠とする。Funbridgeの公開契約ではない。Schemaは [大会](../schemas/tournament.schema.json) と [索引](../schemas/history-index.schema.json)。意味が未確定のフィールドは値を残すか除外し、推測で意味を確定しない。

## 履歴と大会

| 原レスポンス | 出力 | 解釈 |
|---|---|---|
| 履歴 `tournamentID` / BP `sourceTournamentId` | `sourceTournamentId`、大会ファイル `source.sourceTournamentId` | 大会またはイベントの安定ID。BICではイベントIDと子大会IDが異なる。KOは数字文字列。 |
| 履歴 `name` / BP `title` | `title`、`tournament.name` | 取得した日本語UIの大会名または地域。BIC子大会の内部名はイベントのtitleへ置き換える。 |
| BP `startDate` / 大会 `beginDate` / Daily `date` | 索引 `startDate`、大会 `playedAt` | 大会開始時刻。Seriesの履歴 `date` は最終プレイ時刻として索引 `lastPlayedAt`、大会 `lastPlayedAt` に保存。 |
| `endDate` | Daily `endAt` | 大会終了時刻。Seriesでは `periodID` の `startMillis;endMillis` を期間日時に変換し、生IDも `period` に残す。 |
| `coefficient` | BP `level`、`multiplier` | `BP100` 等。100単位を1倍として保存する。BIC子大会の係数が空なら親イベントから得る。 |
| `rank`、`nbTotalPlayer`、`nbPlayers` | 大会 `rank`、`participantCount` | 取得時点の本人順位・大会参加者数。負のrankは未確定として省く。数値が変動する進行中大会ではcapture時刻を付ける。 |
| `resultType` | `scoreType` | 1=MP、2=IMP。 |
| `result` | `score` | MPは0〜1の割合なので100倍して%、IMPは原値。大会・ボード・集計行に同じ規則を適用。 |
| `countDeal`、`nbDealPlayed`、`listPlayedDeals` | `boardCount`、`playedBoardCount` | 宣言ボードと、今回取得可能だったプレイ済みボードを別に保存。Series/BICの進行中ボードは推測生成しない。 |
| `finished` / BP `inProgress` | `completion` | `finished` falseまたは未プレイボードがある場合 `IN_PROGRESS`。Seriesの個別大会完了とシリーズ昇降格は別で、outcomeは未確認なら `PENDING`。 |
| `bridgePoints` | BP `awarded`、索引 `bridgePoints` | 負値は未確定符号として省く。 |
| `periodID` / Daily `name` | Series `period`・期間日時 / Daily `region` | Series IDは意味を決めず文字列として保持。Daily `ASIA` 等は地域。 |

履歴索引の `coverage` は取得行とAPI totalSizeの一致を表す。大会詳細・ボードまであるかは表さない。`standingsCoverage` は**保存した他プレイヤー個別行**の範囲であり、既定のSUMMARYは順位・参加者数を保持していても `NONE`, rowCount 0。履歴にあるeBridge Cupイベントはcategory32で子大会のarchiveが0件、結果画面も「結果は利用できません」であり、索引にだけある。

## ボード

| 原レスポンス | 出力 | 解釈 |
|---|---|---|
| `heroRows.dealIndex` | `boardNumber` | 大会内のボード番号。BP `summary.deal.index` は全体プールindex（例125）で大会ボード番号ではない。 |
| numeric `dealID` / string `dealIDstr` | `source.sourceDealId` | Dailyは数字、Series/BPはソース文字列、KOは数字を文字列化。0は未付与符号。 |
| `summary.gameID` / `heroRows.gameIDstr` | `source.sourceGameId` | 有効なゲームID。`gameID:-1`・0・空は保存しない。BP/Seriesでheroが-1でもsummaryが実IDを返す。 |
| `playerHands.{north,east,south,west}` | `hands.{N,E,S,W}` | `3C-TC-...` を各席 `S.H.D.C` のランク列に正規化。全席13枚、全体52枚一意で検証。 |
| `dealer` / `vulnerability` | `dealer` / `vulnerability` | 席NESW。脆弱性コード L=None, N=NS, E=EW, A=Both。 |
| `bidList` | `auction` | `PA`=PASS、`X1`=double（X）、`X2`=redouble（XX）、`N`=NT。末尾の `A` はalert markerとして保持。最終PASSが省略されても補わない。 |
| `playList` | `play`、`source.claimMarker` | `KHS`=SouthのHK。`!S4` 等はカードではなくクレーム原記号。数字の細かな意味は未確認で、トリック数へ変換しない。 |
| `deal.contract`、`declarer`、`nbTricks` | `contract`、`declarer`、`result` | `3N`→3NT、`X1`→X、`X2`→XX。`result = nbTricks-(6+level)`。`PA`はパスアウトで契約レベルではない。 |
| `heroRows.rank`、`nbTotalPlayer`、`result`、`score`、`lead` | `comparison` | 本人のボード順位、参加者数、MP%/IMP、bridge rawScore、tricks、lead。`score:-32000` は未プレイ内部符号で除く。 |
| `getResultForDeal.listResultDeal` | `comparison.contractGroups` と `unclassifiedPlayerCount`、`passedOutPlayerCount` | `groupByContract:true` の契約・宣言者・トリック・score・同一結果人数。空契約は人数だけ、`PA`はパスアウト人数。上位5契約はこの全行と重複するので保存しない。 |
| 取得行数、`totalSize`、行の `nbPlayerSameGame` 合計 | `contractGroupRows`、`contractGroupCoverage`、`contractGroupIntegrity` | APIがtotalSize=0でも実行結果が100件超をまとめて返すBPボードがある。行数を実数に正規化し、sourceTotalCountは正数のときのみ保存。人数合計が参加人数から±1ずれる15ボードは `FULL` な行取得と `MISMATCH` な人数整合性を両立させる。 |

契約と実カードplayがある337ボードを `boards`、契約既知でplayなし5ボードを `partialBoards` `NO_PLAY`、パスアウト1ボードを `PASSED_OUT`、契約・playとも空341ボードを `NO_CONTRACT_OR_PLAY` にした。契約・play空欄はFunbridgeの実レスポンスであり、ハンド・本人順位・集計は保存する。プレイ52枚未満でclaim markerがある場合、残りを補完しない。

## KOの例外

KO category45は通常の `getResultDealForTournament` category20で取得できない。`getKnockoutPlayerMatches(tournamentId)` からmatch ID・BYE・round番号を得て、`getKnockoutTournamentMatch(matchId)` の `match` と `dealList` から各ボードの本人・対戦者を取得する。BYEはラウンドとして保持しボードを作らない。`getDealResultSummary` category45には4ハンドがあるが、通常の `heroRows` はrank -1・契約空・score -32000など汎用の未プレイ符号を含み、KO本人結果の根拠にしない。

match `scorePlayer1/2` はラウンドスコア、`winner` は勝者ID。deal `result` は本人側のIMP差、`result2` は符号を反転した対戦者側の値。`scorePlayer1/2` の -32000は除き、実rawScoreだけ `matchComparison` に保持する。対戦者の契約・トリックを保持する。今回の3 KO（5、16、5ボード）は本人のオークション・プレイがsummaryで空なので全26ボードをpartialにした。Turbo K.O.の一つは画面で「削除されました」、matchはFINISHEDだが両者0・勝者なし・本人rawScoreは全ボード -32000であり、有効なプレイとみなさない。索引の獲得BPは残す。

## 出力外

APIにあって意図的に出さないもの: Authorization、Cookie、requestId、URL、レスポンス全文、UI分析文、bid/playの生文字列、パーマトリクス、個別他プレイヤー結果、アバター・契約プラン・アカウント状態。APIに無いもの: 未プレイボードの本人の実契約・実play、eBridge Cup子大会結果、KOの通常型契約分布。これらの欠損をSchemaに似せた値で埋めない。
