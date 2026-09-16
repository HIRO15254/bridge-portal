# Funbridge Web版のレスポンス取得

Funbridgeの内部APIは交換仕様ではない。最初の画面遷移で実際のURL・method・POST本文・レスポンス・認証方式を観察し、同一セッション内の読み取り専用APIを直接呼ぶ。DOM操作はAPI発見と画面値の照合に必要だが、各大会・各ボードの呼び出しには不要。セッションが変われば実通信形を再確認する。

## 取得

Codex内蔵ブラウザーで「CDPへのフルアクセスを有効にする」がオンで、対象タブの `capabilities.list()` に `cdp` がある場合、Browser pluginのCDPタブ機能で本文を読む。UI操作は同じタブの通常のクリックで行う。ブラウザーのUI操作APIに `cdp` が表示されなくても、Browser pluginの `scripts/browser-client.mjs` にある `setupBrowserRuntime()` から同じタブの機能を確認する。タブIDを合わせて、機能が公開されている場合にだけ次を行う。

```js
const cdp = await tab.capabilities.get("cdp");
await cdp.send("Network.enable", {});
let cursor = 0;
// この後、画面上の履歴・大会・ボード・ランキングをクリックする。
const batch = await cdp.readEvents({
  afterSequence: cursor,
  methods: ["Network.requestWillBeSent", "Network.responseReceived", "Network.loadingFinished"],
  limit: 200,
  timeoutMs: 1000,
});
cursor = batch.cursor;
const response = batch.events.find(
  (event) => event.method === "Network.responseReceived" &&
    event.params?.response?.status === 200 &&
    new URL(event.params.response.url).pathname.endsWith("/bridgePoints/historic"),
);
const body = await cdp.send("Network.getResponseBody", {
  requestId: response.params.requestId,
});
const json = JSON.parse(body.base64Encoded
  ? Buffer.from(body.body, "base64").toString("utf8")
  : body.body);
```

この例のpathは2026-09-15に観測したもの。将来も同じとは仮定しない。`Network.requestWillBeSent` のmethod、request headers（認証が存在するかだけ確認）、`Network.getRequestPostData` のPOST本文を同じrequestIdで読み、`Network.responseReceived` のURL・statusと対応付ける。204のプリフライトを除き、200のJSONレスポンスを読む。`requestId` はセッション内だけ有効で大会IDとして使わない。Authorizationの値はツール表示・ファイル・ログへ出さない。

## 画面で発見したAPIを直接呼ぶ

Codex内蔵ブラウザーのCDP `Runtime.evaluate` は、認証済みFunbridgeタブのページ側で `fetch` を実行できた。観測したAuthorizationヘッダーを**REPLメモリ内だけ**で使い、同じ `fb3.funbridge.net/funbridge-server-ws/rest/` の既知の履歴・結果・大会エンドポイントに限る。POST本文は観測したキーと、履歴レスポンス由来のsource IDで作る。新しい端末・ブラウザーへtokenを転記しない。ステータス200とJSONの大会・deal IDを照合し、失敗したコールは成果物へ混ぜない。

```js
// observedRequest は Network.requestWillBeSent/getRequestPostData で得た実通信。
// headers.Authorization はメモリ内だけで扱い、nodeRepl.write() しない。
const post = { categoryID: 20, tournamentIDstr: sourceTournamentId };
const expression = `fetch(${JSON.stringify(observedRequest.url)}, {
  method: "POST",
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: ${JSON.stringify(observedRequest.headers.Authorization)}
  },
  body: ${JSON.stringify(JSON.stringify(post))}
}).then(async response => ({ status: response.status, body: await response.json() }))`;
const call = await cdp.send("Runtime.evaluate", {
  expression, awaitPromise: true, returnByValue: true
});
if (call.result?.value?.status !== 200) throw Error("Funbridge API returned a non-200 status");
const responseJson = call.result.value.body;
```

これは結果の読み取りPOSTを示す。実URLを観測できないときは推測で組み立てない。APIにはWeb版の現行セッションの権限が必要であり、ログアウト・別端末接続・期限切れ時はユーザーの再ログイン後に再観測する。

| ファミリー | 実測category | 取得順序・POST形 |
|---|---:|---|
| BP Federal | 20 | `bridgePoints/historic` の履歴全ページ→`getResultDealForTournament` `{categoryID:20,tournamentIDstr:<履歴ID>}`→プレイ済みheroRowsの `dealIDstr` からsummary/group。 |
| BIC | 32 | BPイベントIDから `getTournamentArchives` `{count:50,offset:0,categoryID:32,tournamentId:<イベントID>}`。子大会IDでcategory32のseed→summary/group。親イベントIDを別に保持。 |
| BP KO | 45 | 数字のBPイベントIDで `getKnockoutPlayerMatches` `{tournamentId:<イベントID>}`→`getKnockoutTournamentMatch` `{matchId:<match ID>}`→dealList IDでsummary `{dealID:<ID>,categoryID:45,nbMaxMostPlayedContracts:5,matchId:<match ID>}`。BYEはボードを作らない。 |
| Series | 8 | `getTournamentArchives` の実POSTを観測して全archive→各 `listPlayedDeals` のsource stringでsummary/group。 |
| Daily | 6 | `getTournamentArchives` の実POSTを観測して全archive→各 `listPlayedDeals` のnumeric IDでsummary/group。 |

標準ボードの `getDealResultSummary` は `{dealID:<履歴のdeal ID>,categoryID:<category>,nbMaxMostPlayedContracts:5}`。BP/Seriesではstring deal ID、Dailyではnumeric ID文字列を使う。契約分布の `getResultForDeal` は `{offset:0,nbMaxResult:100,categoryID:<category>,dealID:<numericまたは0>,dealIDstr:<source string>,groupByContract:true,followed:false}`。`offset` を100ずつ進め、正のtotalSizeがあれば取得行数一致で止める。BPの一部はtotalSize=0なのに100行超の全行を1回で返す。sourceTotalSize=0なら行数を実数に正規化し、契約集計人数とhero `nbTotalPlayer` を別に検証する。

認証済みの同じタブで、履歴に入る前にブラウザーのレスポンス記録を開始する。レスポンスイベントや開発者ツールのNetwork/HARなど、本文とrequest URL、method、status、発生時刻を読める手段を選ぶ。画面内リンクを順に操作して、履歴一覧、大会詳細、ディール一覧、ボード結果、比較、リプレイ、順位を開く。レスポンスの到着後に画面の大会名、ボード番号、IDを照合する。

取得時には、JSONなどの構造化本文と必要な識別メタデータだけを扱う。Cookie、Authorization、Set-Cookie、トークン、メールアドレス、アカウント設定を保存しない。HARを中間ファイルにした場合も最終成果物へ添付せず、必要なデータを抽出した後に認証情報が残っていないことを確認する。履歴取得を理由にプロフィールや無関係なAPIへ追加アクセスしない。

レスポンスを記録する手段がない場合、画面上のDOMだけから取得した値の `source.captureMode` は `SPA_UI` にする。レスポンスのURL一覧やコンソールログだけでは本文取得の証拠にならない。

## 対応付けと正規化

- 同一大会を、画面内遷移後のsource tournament IDと本文中の大会IDで確認する。ボードはboard number、deal/game ID、画面の `ディール n/N` を合わせる。IDが一致しないレスポンスを現在の大会に混ぜない。
- 本文が持つ4ハンド、dealer、vulnerability、auction、play、contract、declarer、tricks、score、rank、人数、報酬、契約集計を、それぞれの意味を確認してv1項目へ変換する。カード52枚一意、action index連続、ボード数、score typeを照合する。
- 2026-09-15に観測したBP Circuitでは `bridgePoints/historic` の最初のページが履歴45行、スクロール後の次ページが15行だった。`getFederalTournament` は大会詳細、`getResultDealForTournament` は本人の6ボード結果、`getDealResultSummary` はボードの4ハンド・bidList・playList・分析、`getResultForDeal` は全契約集計、`getResultForTournament` は大会順位の本人周辺150行を返した。画面の大会・deal/game IDと照合して採用する。
- 観測したカード符号は `9HW` = WestのH9、ハンド符号は `3C-TC-...`、ビッド符号は `PAN` = NorthのPASS、`1HE` = Eastの1H、`2DSA` = Southのalert付き2D。`bidList` が最終契約後のPASSを省略していることがあるので追加しない。`playList` 末尾の `!S4` はクレーム記号として `source.claimMarker` に元記号だけを保存する。カード52枚未満でもクレーム記号があれば取得漏れとは判断しない。
- 観測したvulnerability符号は `N` = NS、`E` = EW、`A` = Both。未確認の符号は正規化しない。`3N` は `3NT` とする。`6SX1` のような内部倍増符号は元の `sourceContract` を残す。契約が空でscoreが `-32000` の行は非ブリッジスコアの符号であり、`rawScore` として保存しない。契約なしのボードは `partialBoards` に配札と結果を置く。
- レスポンスの値が画面表示より多い場合、依頼された取得範囲だけを出力する。画面にない追加フィールドを採用する際は意味を確認し、UI値を推測で置き換えない。
- レスポンスにない値を画面から補った場合は `source.captureMode: "MIXED"` とする。レスポンスだけなら `NETWORK_RESPONSE`、画面だけなら `SPA_UI` とする。画面原文そのものはSchemaにないため、分析に必要な値へ整形できない場合は保存しない。
- 出力にはsource大会・deal・game ID、取得時刻、locale、captureModeだけを根拠情報として保持する。requestId、通信path、response全文、上位5契約の重複コピー、長い分析文は出力しない。[大会Schema](../schemas/tournament.schema.json)と[履歴索引Schema](../schemas/history-index.schema.json)以外のフィールドは採用しない。

## coverageと照合報告

履歴一覧もoffsetとtotalSizeを照合する。2026-09-15のBP Circuitでは最初の応答がoffset 0、45件、totalSize 60だった。画面を末尾へスクロールするとoffset 45の15件が追加され、60件の索引を作れた。最初の1ページだけを `FULL` と表現しない。索引はタイトル、開始日時、係数、登録人数、本人順位・獲得BP、進行状態など履歴行にある項目だけを保持し、各大会のボード詳細まで取得したかとは区別する。

ページングや仮想リストがある順位レスポンスは、取得済み行とtotal countを比較する。全ページを取得し件数が一致した場合だけ `FULL`、一部なら `VISIBLE_WINDOW`、本文がなければ `NONE` とする。大会・ボードのIDで重複排除し、rankが同じ別プレイヤーは残す。

実出力の監査では、Funbridgeの画面とレスポンスで確認した項目を「保持」「一部保持」「欠損」「未確認」に分ける。特に全ボード、4ハンド、auction、実際にプレイしたカード枚数とクレーム、本人結果、契約集計、他プレイヤー順位、原文ラベルを数で示す。現在のBridge PortalインポーターがD1へ正規化しない拡張フィールドも、JSON自体には保持されるという違いを明記する。
