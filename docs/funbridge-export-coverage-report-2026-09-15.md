# Funbridge全履歴エクスポート監査（2026-09-15）

**BP Circuit・Series・Dailyの履歴索引は69/69件、結果の提供される大会詳細は68件、プレイ済みボードは684/684件取得した。** 正式出力は [大会Schema](../.agents/skills/funbridge-history-export/schemas/tournament.schema.json) と [履歴索引Schema](../.agents/skills/funbridge-history-export/schemas/history-index.schema.json) に従う。認証済みFunbridge Webで実POST・レスポンスをCDPで観測し、以降は同じタブ内から確認済みの読み取り専用APIを呼んだ。画面の大会・ボードIDとAPIのsource ID、本人順位・スコアを照合した。中間レスポンス・認証ヘッダーは正式出力に含めない。

| 対象 | 索引のcoverage | 大会詳細 | 取得したプレイ済みボード | 契約集計 |
|---|---:|---:|---:|---:|
| BP Circuit | 60/60 `FULL` | 59ファイル（Federal 55、BIC子大会 1、KO 3） | 554（Federal 527、BIC 1、KO 26） | 528/528 標準ボード。KO 26は契約分布APIがない |
| Series | 3/3 `FULL` | 3ファイル | 10/10（進行中1大会は2/4） | 10/10 |
| Daily | 6/6 `FULL` | 6ファイル | 120/120 | 120/120 |
| 合計 | **69/69** | **68ファイル** | **684** | **658** |

BPの2つのBICイベントは索引には残る。BP1000イベント `6a9e78b7218733689da2f2d4` はcategory32に子大会 `6aa8816995dcec32d17078b2` があり、16ボード中プレイ済み1ボードを親イベントID付きの大会JSONにした。eBridge Cupイベント `69ea0eed15acde656fea7e0f` はcategory32のarchiveが0件で、Funbridge画面も「結果は利用できません」と表示するため、詳細JSONは作れない。シリーズの未プレイ2ボードとBICの未プレイ15ボードも実ハンド・本人プレイが提供されず、生成しない。KOのWeekly Knockoutにはround 1 BYEがあり、ラウンドメタデータは保持するがBYEボードは生成しない。

## 正式JSONが保持する情報

| Funbridge内の情報 | 正式出力の保持状況 |
|---|---|
| 履歴一覧 | 全69行のsource ID、原題、ファミリー別の開始/最終プレイ日時、係数・期間・地域、登録人数、本人順位・スコア・BP、進行状態・宣言/プレイ済みボード数。APIの総件数と行数が一致した索引 `FULL`。 |
| 大会結果 | 68大会のID、名称、本人スコア（MPは%に変換）、有効な順位・人数・BP、結果時点、完了状態、宣言ボードとプレイ済みボードを分けた数。進行中の値には取得時刻を付ける。 |
| 配札・ボード | 全684ボードの4席13枚、52枚一意、dealer、vulnerability、source deal/game ID。本人順位・参加人数・ボードスコアが通常レスポンスにある658ボードで保持される。 |
| 契約・実プレイ | 元レスポンスの契約あり342ボード中、契約と実カードplayを持つ337ボードはコア `boards`。契約既知・playなし5ボードを `NO_PLAY`、パスアウト1ボードを `PASSED_OUT`、契約とplayが空の341ボードを `NO_CONTRACT_OR_PLAY` としてハンド・取得できた結果を保持する。総auction 3,293コール、実カード15,032枚を正規化し、200個のクレーム原記号を保存した。 |
| 契約分布 | 658ボードの全23,848集計行。正規化可能な行は契約・宣言者・トリック・rawScore・MP%/IMP・同一結果人数。空契約は `unclassifiedPlayerCount`（合計166,231人）、`PA` は `passedOutPlayerCount`（合計203人）として人数を保持。上位5契約は全行と重複するため別保存しない。 |
| KO | 3イベントのmatch ID、ラウンド、BYE/FINISHED、両者ラウンドスコア・勝者、26ボードのIMP差、本人/対戦者の有効rawScore、対戦者契約・トリック。KO summaryの汎用未プレイ符号を本人結果と取り違えない。 |
| 取得範囲の証拠 | source ID、captureMode `NETWORK_RESPONSE`、locale、取得/出力時刻、順位表・契約集計のcoverage、人数整合性、注意事項。 |

契約集計の行取得は658/658ボードで完了したが、**15ボードで行の `nbPlayerSameGame` 合計と `heroRows.nbTotalPlayer` が±1人異なる**。取得漏れではなくAPI値同士の差として `contractGroupCoverage: FULL` と `contractGroupIntegrity: MISMATCH`、元の行数・人数合計を併記した。BPではAPI `totalSize:0` のまま100行超を1応答で返す9ボードがあり、出力は受信した実行数を採用している。人数を水増し・削減して一致させていない。

## 失われる情報と限界

| 種類 | 出力されない情報・理由 |
|---|---|
| 意図的な選別 | 他プレイヤーの個別順位行、プロフィール、アバター、契約プラン・アカウント状態、UIのAI分析文・ビッド/プレイ提案、パーマトリクス、上位5契約の重複コピー、生 `bidList`/`playList`。既定の `standingsCoverage` は保存行0の `NONE` で、本人順位は大会/ボード結果に保持。 |
| 通信・認証 | Authorization、Cookie、HAR、requestId、レスポンス全文、内部path。保存に必要なsource IDとcapture時刻だけ残した。 |
| 元APIに存在しないもの | 未プレイのSeries/BICボードの本人実契約・auction/play、eBridge Cupの子大会結果、KOで空欄の本人auction/playと通常型契約分布。欠損を推測で補わない。 |
| 元記号の未確定な意味 | `!S4` 等のクレーム数字の厳密な意味、Series periodIDのopaque部分。値・日時は保存し、意味を決め打ちしない。 `bidList` が最終PASSを省く場合も追加しない。 |
| 時点差 | 進行中Series/BICの参加人数・rank・scoreは閲覧時刻で変わる。索引と大会詳細の取得時刻が異なれば値が異なり得る。 |

Funbridge側の全情報をそのまま保持するエクスポートではない。現行Bridge Portalインポーターではコア `boards` は受理されるが、`partialBoards`・契約分布・KO match拡張はD1に正規化されず、元JSONをPrivate R2へ保存する。全大会のD1取込は実施していない。以前のExpress大会1件では4コアボードが受理され、partialや短いclaim playに対する取込警告が確認された。

スキル同梱validatorでローカル出力の**全71 JSONをDraft 2020-12 Schemaと配札・アクション・coverage・人数整合性にかけ、0エラー・0 validator警告**。15件のFunbridge API人数差は実データとして明示され、validatorの隠れた警告にしない。本人の履歴JSONと索引はリポジトリへコミットせず、`funbridge-export/` をGit除外対象にしている。
