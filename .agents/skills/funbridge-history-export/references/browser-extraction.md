# Funbridge Web版の画面抽出メモ

2026-09-12に日本語UIで確認した構造である。クラス名やSVG識別子が変わった場合は、現在のアクセシビリティツリーとDOMを観察して同じ意味の要素を再特定する。古いURLや固定された要素番号は再利用しない。

## 読み込み判定

画面操作の直後に新しい状態を取得する。`読み込み中...` が消え、大会詳細なら大会名・状態・ボード数・MP/IMP・参加者数、ボード結果なら `ディール n/N`・rank・score、リプレイなら4つの `.cards-hand` と各13枚、順位表ならヘッダーと行または明示的な空状態が現れるまで値を採用しない。

読み込み後も大会名、人数、score typeが欠けるときは、SPA状態が失われたものとして画面の「ホーム」から辿り直す。

## 取得元ID

画面内遷移で正常表示された後だけ、現在URLのパスまたはbase64 JSONの `d` から `categoryID`、`tournamentID` / `tournamentIDStr`、`dealID` / `dealIDStr`、`gameID` / `gameIDStr`、`playerID` を読む。

これらは `source` に保存する識別子であり、直接ナビゲーションには使わない。base64はURL-safe文字へ戻し、paddingを補ってJSONとして読む。デコードに失敗した場合はURL全体を保存せず、画面に現れたIDだけを使いwarningを残す。

## 4ハンド

リプレイの `.cards-hand` を対象に、子孫の `svg use` の `xlink:href` を読む。

| hand class | seat |
|---|---|
| `cards-hand-TOP` | `N` |
| `cards-hand-RIGHT` | `E` |
| `cards-hand-BOTTOM` | `S` |
| `cards-hand-LEFT` | `W` |

カード識別子は `#card-us-gs-4s`、`#card-us-gs-tc` の形である。末尾2文字をrankとsuitとして読み、`t` を `T`、`s/h/d/c` を `S/H/D/C` に変換する。出力カードはsuit-first、ハンドは `S.H.D.C` 順に並べる。

```js
const hands = await tab.playwright.locator(".cards-hand").evaluateAll((nodes) =>
  nodes.map((node) => ({
    className: node.getAttribute("class"),
    cards: [...node.querySelectorAll("svg use")]
      .map((use) => use.getAttribute("xlink:href"))
      .filter((href) => href?.startsWith("#card-")),
  })),
);
```

4x13枚、全52枚一意でなければ、その画面からの抽出を確定しない。

## dealerとvulnerability

`.auction-box.theme-fb` の先頭行に座席ヘッダーがある。`text-underline` を持つ座席がdealer、`text-red` を持つ座席がvulnerableである。赤なし=`None`、N/S=`NS`、E/W=`EW`、4席=`Both`。

ボード結果に表示される `バルネラビリティ： ...` の原文も `board.source.raw.vulnerabilityLabel` に保存し、2つの根拠が矛盾したら確定しない。

## auction

`.auction-box.theme-fb` の4列はヘッダー座席順と一致する。各call要素のidは確認時点で `BID-1C0-0-AUCTION-BOX-TABLE_CENTER_ELEMENT`、`BID-PA1-0-...`、`BID-X3-0-...` の形だった。

最初の部分にcall tokenとグローバルaction indexが含まれる。id末尾寄りの列番号をaction indexと誤認しない。全列からグローバルindexを抽出して数値順に並べ、列ヘッダーからseatを付ける。

- `PA` または `#bid-pass*` → `PASS`
- `X` → `X`
- `XX` → `XX`
- `1C`〜`7S` → 同じ値
- `1NT`〜`7NT` または `N` 表記 → `NT`へ正規化

callの主SVG以外に `#bid-a` がある場合はalert。説明が表示できなければ `alert: "ALERTED"` とする。主SVGとalert SVGを別callとして数えない。

## play

リプレイのサイドパネルが閉じている場合は `.sidebar-button` をクリックし、`.sidebar-tab` のうち表示文字が `トリックリスト` のものを選ぶ。各 `.TrickBoxCards` が1トリックで、子のcard要素のDOM順がプレイ順だった。

確認時点ではcardのstyleにある `--drag-rotation` がseatを表した。

| rotation | seat |
|---:|---|
| `0deg` | `N` |
| `90deg` | `E` |
| `180deg` | `S` |
| `-90deg` | `W` |

`.bridge-card-with-arrow` はトリック勝者の表示に使われていた。seatの復元は、cardがそのseatのhandに属すること、1トリック4席であること、次トリックのleadが前トリック勝者であることでも検証する。style表現が変わった場合はopening leaderとtrick winner規則から順番を復元し、推測だけでseatを付けない。

出力はトリック1からDOM順に平坦化し、`index` を0から連続、`trickNumber` を1から13にする。

## contract、declarer、result

ボード結果とリプレイの両方を使う。contractはbid SVGを `2S`、`3NT` などへ変換し、double/redoubleがあれば `X`/`XX` を末尾に付ける。declarerは結果表の `Decl` とauctionから照合する。`result = tricksTaken - (6 + level)`。画面のsigned scoreは `comparison.rawScore` に表示の符号を保って入れ、視点を変えない。

## ボード比較

「最もよくプレイされたコントラクト」はサマリーで、「すべてのコントラクトを見る」は集計ランキングへ遷移する。集計行は `.fb-table-row` で、列は画面上の順にrank、contract、declarer、tricks、lead、raw score、MP/IMP score、player countである。

contract、double/redouble、lead cardはテキストではなく `svg use` に入ることがある。`#bid-*` と `#card-*` を併用して読む。

「プレイヤー」タブでは個別行を取得できる。player IDは `/account/<id>`、display nameは同じ行、country codeはflag画像の`alt`から読み、rank、contract、declarer、tricks、lead、raw score、MP/IMP scoreを保存する。

同順位・同結果でも別プレイヤーを落とさない。重複キーは `player.funbridgeId` を第一候補とし、ない場合は `rank + displayName + contract + rawScore` を使う。

## 大会順位表と仮想スクロール

大会順位表は本人順位付近へ自動スクロールし、`showing X-Y of Z items` のような仮想リストになる場合がある。

`SUMMARY` では現在読み込まれたrank範囲、row count、total count、本人行を保存し、coverageを `VISIBLE_WINDOW` にする。

`FULL` では仮想リスト内を先頭へスクロールし、表示行をplayer IDで重複排除しながら1画面ずつ末尾まで進む。新規IDが増えず、取得件数がtotal countと一致したときだけ `FULL` にする。DOM行が再利用されるため、最後に見えている要素を後からまとめて読む方法は使わない。

## 読取専用の境界

利用してよい操作は、ホーム、トーナメント、履歴、大会、ディール一覧、ランキング、すべてのコントラクト、もう一度見る、リプレイのサイドパネル、トリックリスト、スクロールである。

もう一度プレイする、新規大会の開始、ディールライブラリーへの保存、共有、報告、アカウント・課金・通知・設定の変更は操作しない。
