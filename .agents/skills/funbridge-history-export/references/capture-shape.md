# 認証情報を除いた一時captureの形

`scripts/build-tournament-from-capture.mjs` は**Funbridgeの生レスポンスやHARを入力にしない**。Networkで取得したJSONから下記の必要フィールドだけを一時的に `funbridge-export/.capture/{bp-circuit,series,daily}/<source-tournament-id>.json` へ保存する。Authorization、Cookie、request headers、URL、requestId、個別他プレイヤー行、分析文はこの時点で除外する。正式JSONと検証・監査レポートを作った後、一時captureを成果物から除く。

## 共通ファイル

```js
{
  archive,              // BPは履歴索引row、Series/Daily/BICは下記archive row
  seed?,                // BP Federal/BIC: tournament、heroRows、offset、totalSize
  parentEvent?,         // BIC子大会のみ: 親BP履歴row
  kind?,                // KOのみ "KNOCKOUT"
  matches?,             // KOのみ: matchとdealList
  boards: {
    "1": { summary, groups },        // 通常大会: 大会内boardNumber
    "2:1": { matchId, roundNumber: 2, boardNumber: 1, summary } // KO
  },
  accountId             // ログイン本人のFunbridge player IDのみ
}
```

通常archive rowの許可フィールドは `categoryID,date,rank,result,resultType,nbPlayers,tournamentID,finished,listPlayedDeals,countDeal,periodID,name,bridgePoints`。BP rowは履歴索引Schemaの `sourceTournamentId,title,startDate,coefficient,registeredPlayerCount,inProgress,rank,bridgePoints`。BP `seed.tournament` は `tourIDstr,name,beginDate,endDate,categoryID,countDeal,resultType,nbTotalPlayer,coefficient,resultPlayer{rank,result,nbTotalPlayer,nbDealPlayed,bridgePoints}`、`seed.heroRows` は本人の宣言ボード全行。

`summary` は `getDealResultSummary.data` から次だけ選ぶ。

```js
{
  gameID,
  deal: { playerHands, dealer, vulnerability, bidList, playList,
          declarer, contract, nbTricks, score, index },
  heroRows: result.listResultDeal.map(hero),
  tournament: { ID, tourIDstr, name, beginDate, endDate, categoryID,
                countDeal, resultType, nbTotalPlayer, periodID, coefficient,
                resultPlayer: { rank, result, nbTotalPlayer, nbDealPlayed, bridgePoints } },
  nbPlayers
}
```

`hero` の許可フィールドは `dealID,dealIDstr,dealIndex,rank,result,resultType,contract,declarer,nbTricks,score,nbTotalPlayer,played,gameID,gameIDstr,lead,playerID`。`groups` は `getResultForDeal.data.resultDealTournament` から `{offset,totalSize,sourceTotalSize?,rows,participantSum?,expectedPlayers?}`。各rowは `dealID,dealIDstr,dealIndex,rank,result,resultType,contract,declarer,nbTricks,score,nbPlayerSameGame,lead` のみ。`sourceTotalSize:0` で行があるBP応答は `totalSize` を実行数に正規化する。ページが分かれたらsource deal IDとoffsetを確認し、行を連結してから保存する。

KO `matches[]` は `{match,dealList}`。matchの許可フィールドは `id,tournamentId,startDate,endDate,roundNumber,nbDeals,status,scorePlayer1,scorePlayer2,winner,resultType,player1ID,player2ID`。dealListの許可フィールドは `dealIDstr,result,result2,gameIDPlayer1str,declarerPlayer1,contractPlayer1,nbTricksPlayer1,scorePlayer1,playedPlayer1,gameIDPlayer2str,declarerPlayer2,contractPlayer2,nbTricksPlayer2,scorePlayer2,playedPlayer2,leadPlayer1,leadPlayer2`。KO summaryは4ハンド用で、本人結果はdealListを優先する。BYEのdealListは空。KOボードのキーは `roundNumber:round内boardNumber`。

保存前にsource tournament/deal/game/match IDを対応付ける。`archive.listPlayedDeals` またはseed本人行にある各プレイ済みIDを1回だけ使い、summaryの大会IDと本人gameIDが合うか確認する。宣言ボード数とプレイ済みID件数、取得したboard key数を比べる。資格情報を除いたcaptureであってもハンドと本人結果を含むので作業用にだけ置く。
