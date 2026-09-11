export const JCBL_RULESET_VERSION = "JCBL_LIST_A_2026_05_01" as const;
export const JCBL_RULESET_EFFECTIVE_DATE = "2026-05-01" as const;
export const JCBL_OFFICIAL_URL =
	"https://www.jcbl.or.jp/home/information/handbook/tabid/1544/default.aspx";

export type RuleCategory =
	| "OPENING_BIDS"
	| "RESPONSES_REBIDS"
	| "COMPETITIVE_DEFENSIVE"
	| "CARDING";
export type AlertRequirement = "REQUIRED" | "NOT_REQUIRED" | "CONTEXTUAL";

export interface RuleDefinition {
	readonly alert: AlertRequirement;
	readonly applicability: string;
	readonly category: RuleCategory;
	readonly configuration: readonly string[];
	readonly effectiveDate: typeof JCBL_RULESET_EFFECTIVE_DATE;
	readonly evaluatorId: string;
	readonly example: string;
	readonly exampleKind: "AUCTION" | "PLAY";
	readonly officialItemId: string;
	readonly officialUrl: string;
	readonly summary: string;
	readonly title: string;
	readonly variants: readonly string[];
	readonly versionId: string;
}

const applicabilityById: Readonly<Record<string, string>> = {
	"A-OB-01":
		"オープンする番で、それ以前にパス以外のCallがなく、ハンドをナチュラルに表現するとき。Natural NTは通常のバランス形に加え、A・K・Qいずれかのシングルトンを持ち他の3スーツが各4枚の形も選択できる。Weak TwoではHCPとビッドスーツ枚数の合計も確認する。",
	"A-OB-02":
		"オープンする番で、20HCP以上、17HCP以上かつメジャー4ルーザー以下／マイナー3ルーザー以下、または14HCP以上・5コントロール以上かつ同じルーザー条件のうち、採用した定義を満たすハンドを2♣で示すとき。",
	"A-RR-01":
		"パートナーのナチュラルCallへ応答するとき、またはオープナー／レスポンダーが自然なスーツやNTを再提示するとき。",
	"A-RR-02":
		"適格なNatural 1NTオープンに対し、4枚メジャーの有無を問い合わせるレスポンダーの番。",
	"A-RR-03":
		"パートナーがStrong Artificial Forcing 2♣をオープンし、2♦を人工的なレスポンスとして採用しているとき。",
	"A-RR-04":
		"パートナーのNatural Strong Twoオープンに対し、設定上の弱いハンドを持つレスポンダーの番。",
	"A-RR-05":
		"パートナーのWeak Twoオープンに対し、ゲーム判断のために強さ・Feature・スーツ品質を問い合わせるとき。",
	"A-RR-06":
		"トランプ合意後にAまたはKの枚数を尋ねる局面と、そのaskへ相手が介入した局面。",
	"A-RR-07":
		"Natural NTを起点とし、4♣／5♣でA／Kの枚数を問い合わせる合意を使う局面。",
	"A-RR-08":
		"トランプ合意後、グランドスラム判断のため5NTでトランプのトップアナーを問い合わせる局面。",
	"A-RR-09":
		"StaymanまたはGerberを組み込むNatural 1NTのSystem rangeを設定・評価するとき。",
	"A-RR-10":
		"パートナーのスーツを支持し、自分の実スーツも示すジャンプシフトをレスポンスとして選ぶ局面。",
	"A-CD-01":
		"相手のオープン後、自分の実スーツと設定強度を直接示して競争参加するとき。",
	"A-CD-02":
		"相手のオープン後、未ビッドの特定2スーツを5-4以上で同時に示すNTオーバーコールを使うとき。",
	"A-CD-03":
		"相手のスーツオープン後、そのスーツが短く他スーツへ対応できるハンドでDoubleするとき。",
	"A-CD-04":
		"相手がスラムへ到達し、通常でないオープニングリードをパートナーへ要求できるとき。",
	"A-CD-05":
		"パートナーのオープンに相手がオーバーコールし、未ビッドスーツを示すためDoubleするとき。",
	"A-CD-06":
		"味方の低いコントラクトがペナルティDoubleされ、別のスーツへ逃げるようRedoubleで要求するとき。",
	"A-CD-07":
		"相手が示したスーツをCue Bidし、ゲームフォース以上の強さを表すとき。",
	"A-CD-08":
		"パートナーのオーバーコール後、相手スーツのCue Bidで支持とInvitation以上を示すとき。",
	"A-CA-01":
		"本人がディフェンスの最初のTrickへリードし、採用したHonor／AK／small-card方式を客観的に適用できるとき。",
	"A-CA-02":
		"本人がディフェンスでFollowし、Attitude・Count・Suit Preferenceのどれを示す局面か客観的に確定できるとき。",
};

function rule<const ItemId extends string>(
	officialItemId: ItemId,
	category: RuleCategory,
	title: string,
	summary: string,
	example: string,
	variants: string[],
	configuration: string[],
	alert: AlertRequirement = "CONTEXTUAL"
): RuleDefinition & { readonly officialItemId: ItemId } {
	return Object.freeze({
		alert,
		applicability: applicabilityById[officialItemId] ?? summary,
		category,
		configuration: Object.freeze(configuration),
		effectiveDate: JCBL_RULESET_EFFECTIVE_DATE,
		evaluatorId: `eval-${officialItemId.toLowerCase()}`,
		example,
		exampleKind: category === "CARDING" ? "PLAY" : "AUCTION",
		officialItemId,
		officialUrl: JCBL_OFFICIAL_URL,
		summary,
		title,
		variants: Object.freeze(variants),
		versionId: `${officialItemId}@2026-05-01`,
	});
}

export const JCBL_LIST_A_2026_05_01 = Object.freeze([
	rule(
		"A-OB-01",
		"OPENING_BIDS",
		"ナチュラル・オープン",
		"ウィーク2を含むナチュラルなオープン。Natural NTでは通常のバランス形とシングルトン・トップオナーを持つ4-4-4-1を扱い、ウィーク2はRule of 10を満たす。",
		"Systemで許可していれば、♠Aのシングルトンを持つ4-4-4-1は設定レンジ内でNatural 1NTの候補になる。6HCPで6枚スペードなら合計12なので2♠の候補になる。",
		["1-level natural", "Natural 1NT", "Weak Two", "Rule of 10"],
		["HCP range", "Suit length", "NT shape / singleton top honor"],
		"CONTEXTUAL"
	),
	rule(
		"A-OB-02",
		"OPENING_BIDS",
		"強いアーティフィシャル2♣",
		"強いハンドを示すフォーシング2♣。20HCP以上、17HCP以上と規定ルーザー数、14HCP以上・5コントロール以上と規定ルーザー数の3定義を扱う。",
		"メジャーなら4ルーザー以下、マイナーなら3ルーザー以下を、選んだHCP／コントロール条件と組み合わせる。",
		["20+ HCP", "17+ HCP loser definition", "14+ HCP and 5+ controls"],
		["Strong hand definition"],
		"REQUIRED"
	),
	rule(
		"A-RR-01",
		"RESPONSES_REBIDS",
		"ナチュラル・レスポンス／リビッド",
		"示したスーツ、点数、フォーシング性に沿って自然に競りを進める。",
		"1♣-1♥は設定されたHCPとハート枚数を満たす。",
		["Response", "Opener rebid", "Responder rebid"],
		["HCP ranges", "Suit lengths", "Forcing status"]
	),
	rule(
		"A-RR-02",
		"RESPONSES_REBIDS",
		"Stayman",
		"NTオープン直後の一つ上の♣でメジャーフィットを探す。",
		"1NT-2♣で4枚メジャーを問い合わせる。",
		["Stayman"],
		["Eligible NT openings"],
		"REQUIRED"
	),
	rule(
		"A-RR-03",
		"RESPONSES_REBIDS",
		"強い2♣への2♦",
		"フォーシング2♣に対するアーティフィシャル2♦レスポンス。",
		"2♣-2♦を待機または弱いレスポンスとして採用する。",
		["Artificial 2D response"],
		["Response meaning"],
		"REQUIRED"
	),
	rule(
		"A-RR-04",
		"RESPONSES_REBIDS",
		"Natural Strong Twoへの弱い2NT",
		"ナチュラルな強い2オープンに弱いハンドを2NTで示す。",
		"2♥-2NTを弱いレスポンスとして使う。",
		["Weak 2NT response"],
		["Weak range"],
		"REQUIRED"
	),
	rule(
		"A-RR-05",
		"RESPONSES_REBIDS",
		"Weak Twoへの2NT Inquiry",
		"ウィーク2の強さ、絵札、トランプ内容などを問い合わせる。",
		"2♠-2NTでオープナーの内容を尋ねる。",
		["Feature ask", "Ogust-style ask"],
		["Inquiry responses"],
		"REQUIRED"
	),
	rule(
		"A-RR-06",
		"RESPONSES_REBIDS",
		"Blackwoodと妨害対応",
		"4NT／5NTでA・Kの枚数を尋ね、妨害後はDOPI、DEPO、ROPI等で応答する。",
		"4NTへの介入後に採用Variantの段階応答を使う。",
		["Blackwood", "5NT king ask", "DOPI", "DEPO", "ROPI"],
		["Response steps"],
		"REQUIRED"
	),
	rule(
		"A-RR-07",
		"RESPONSES_REBIDS",
		"Gerber",
		"4♣／5♣でA・Kの枚数を尋ねる。",
		"1NT-4♣をエース・アスキングとして使う。",
		["4C ace ask", "5C king ask"],
		["Response steps"],
		"REQUIRED"
	),
	rule(
		"A-RR-08",
		"RESPONSES_REBIDS",
		"Grand Slam Force",
		"5NTでトランプの内容を問い合わせる。",
		"切り札合意後の5NTでトップアナーを尋ねる。",
		["Grand Slam Force"],
		["Trump responses"],
		"REQUIRED"
	),
	rule(
		"A-RR-09",
		"RESPONSES_REBIDS",
		"Natural 1NTの範囲制限",
		"Stayman／Gerberを使う1NTは下限15HCP以上、レンジ幅5HCP以内。",
		"15-17NTは条件を満たす。",
		["Stayman eligibility", "Gerber eligibility"],
		["1NT min/max HCP"],
		"NOT_REQUIRED"
	),
	rule(
		"A-RR-10",
		"RESPONSES_REBIDS",
		"Fit-showing Jump",
		"サポートを保証するナチュラルなジャンプシフト。2スーツの合計は9枚以上。",
		"1♥-2♠のジャンプでハート支持とスペードを示す。",
		["Fit-showing jump"],
		["Support length", "Jump-suit length"],
		"REQUIRED"
	),
	rule(
		"A-CD-01",
		"COMPETITIVE_DEFENSIVE",
		"ナチュラル・オーバーコール",
		"実際のスーツ長と設定強度を示すナチュラルなオーバーコール。",
		"1♣への1♠は設定されたスペード長と強度を満たす。",
		["One-level", "Two-level"],
		["HCP ranges", "Suit lengths"]
	),
	rule(
		"A-CD-02",
		"COMPETITIVE_DEFENSIVE",
		"Unusual NT",
		"マイナーまたは低い未ビッド2スーツを5-4以上で示す。未パス時は2NT以上。",
		"1♠-2NTでクラブとダイヤの合計9枚以上を示す。",
		["Minors", "Two lowest unbid"],
		["Minimum lengths", "Passed-hand state"],
		"REQUIRED"
	),
	rule(
		"A-CD-03",
		"COMPETITIVE_DEFENSIVE",
		"Takeout Double",
		"相手のスーツ以外への適合と競る強さを示すダブル。",
		"1♥-Xで他のスーツへの対応力を示す。",
		["Direct", "Balancing"],
		["Minimum strength", "Shortness"]
	),
	rule(
		"A-CD-04",
		"COMPETITIVE_DEFENSIVE",
		"Lightner Double",
		"スラムコントラクトに普通でないリードを要求するダブル。",
		"6♠へのXで通常外のリードを求める。",
		["Lightner"],
		["Lead exclusions"],
		"REQUIRED"
	),
	rule(
		"A-CD-05",
		"COMPETITIVE_DEFENSIVE",
		"Negative Double",
		"オープン、オーバーコール、ダブルの順で未ビッドスーツを示す。",
		"1♦-(1♠)-Xでハートを示す。",
		["Negative double"],
		["Level limit", "Minimum strength"]
	),
	rule(
		"A-CD-06",
		"COMPETITIVE_DEFENSIVE",
		"SOS Redouble",
		"ペナルティダブル後に別のコントラクトへ逃げるよう求める。",
		"1NT-X-XXをテイクアウト要求として使う。",
		["SOS redouble"],
		["Escape priorities"],
		"REQUIRED"
	),
	rule(
		"A-CD-07",
		"COMPETITIVE_DEFENSIVE",
		"Game-forcing Cue Bid",
		"相手スーツのキュービッドでゲームフォーシング以上を示す。",
		"相手の1♠に2♠で強いハンドを示す。",
		["Game force cue bid"],
		["Minimum strength"],
		"REQUIRED"
	),
	rule(
		"A-CD-08",
		"COMPETITIVE_DEFENSIVE",
		"Support Cue Bid",
		"相手スーツのキュービッドでサポートとインビテーション以上を示す。",
		"パートナーのオーバーコール後に相手スーツをキュービッドする。",
		["Limit raise or better"],
		["Support length", "Minimum strength"],
		"REQUIRED"
	),
	rule(
		"A-CA-01",
		"CARDING",
		"Opening Lead",
		"Fourth highest、Top of Nothing、MUD、Honor Sequence、A/K from AKを設定どおり使う。",
		"KQJからK、small3枚から採用方式のカードをリードする。",
		[
			"Fourth highest",
			"Top of Nothing",
			"MUD",
			"Honor sequence",
			"A from AK",
			"K from AK",
		],
		["Lead style", "AK lead"],
		"NOT_REQUIRED"
	),
	rule(
		"A-CA-02",
		"CARDING",
		"Signals",
		"Normal Attitude、Count、Suit Preferenceを局面と優先順位に沿って使う。",
		"High-lowで偶数枚、low-highで奇数枚を示す。",
		["Normal attitude", "Count", "Suit preference"],
		["Signal priority"],
		"NOT_REQUIRED"
	),
] as const satisfies readonly RuleDefinition[]);

export const JCBL_RULESET_MANIFEST = Object.freeze({
	id: JCBL_RULESET_VERSION,
	effectiveDate: JCBL_RULESET_EFFECTIVE_DATE,
	officialUrl: JCBL_OFFICIAL_URL,
	immutable: true,
	itemCount: 22,
	items: JCBL_LIST_A_2026_05_01,
	glossary: Object.freeze({
		Natural: "実際に示すスーツ、NTの形、または一般的な強さを直接表すCall。",
		Treatment: "ナチュラルなCallに付随して意味や継続方法を定める取り決め。",
		Convention: "ナチュラルな意味とは異なる情報を体系的に交換する取り決め。",
		CueBid:
			"相手が示したスーツを競ることで、別の強さ・支持・コントロールを表すCall。",
	}),
	fullDisclosure:
		"採用した意味、レンジ、例外、継続を相手に正確に説明できる状態を保つ。",
	alertPolicy:
		"各RuleDefinitionのalertはリストA固有の教材メタデータであり、競技会固有の手順説明は対象外。",
} as const);

export type OfficialItemId =
	(typeof JCBL_LIST_A_2026_05_01)[number]["officialItemId"];

export function getRule(officialItemId: string): RuleDefinition | undefined {
	return JCBL_LIST_A_2026_05_01.find(
		(item) => item.officialItemId === officialItemId
	);
}
