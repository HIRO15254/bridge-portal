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
	alert: AlertRequirement;
	category: RuleCategory;
	configuration: string[];
	effectiveDate: typeof JCBL_RULESET_EFFECTIVE_DATE;
	evaluatorId: string;
	example: string;
	officialItemId: string;
	officialUrl: string;
	summary: string;
	title: string;
	variants: string[];
	versionId: string;
}

function rule(
	officialItemId: string,
	category: RuleCategory,
	title: string,
	summary: string,
	example: string,
	variants: string[],
	configuration: string[],
	alert: AlertRequirement = "CONTEXTUAL"
): RuleDefinition {
	return {
		alert,
		category,
		configuration,
		effectiveDate: JCBL_RULESET_EFFECTIVE_DATE,
		evaluatorId: `eval-${officialItemId.toLowerCase()}`,
		example,
		officialItemId,
		officialUrl: JCBL_OFFICIAL_URL,
		summary,
		title,
		variants,
		versionId: `${officialItemId}@2026-05-01`,
	};
}

export const JCBL_LIST_A_2026_05_01 = [
	rule(
		"A-OB-01",
		"OPENING_BIDS",
		"ナチュラル・オープン",
		"ウィーク2を含むナチュラルなオープン。ウィーク2はRule of 10を満たす。",
		"6HCPで6枚スペードなら合計12なので2♠の候補になる。",
		["1-level natural", "Natural 1NT", "Weak Two", "Rule of 10"],
		["HCP range", "Suit length", "NT shape"],
		"CONTEXTUAL"
	),
	rule(
		"A-OB-02",
		"OPENING_BIDS",
		"強いアーティフィシャル2♣",
		"ゲームがありそうな強いハンドを示すフォーシング2♣。3種類の強さの定義を扱う。",
		"20HCP以上、または規定のルーザー数とHCP／コントロール条件を満たす。",
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
] as const satisfies readonly RuleDefinition[];

export const JCBL_RULESET_MANIFEST = {
	id: JCBL_RULESET_VERSION,
	effectiveDate: JCBL_RULESET_EFFECTIVE_DATE,
	officialUrl: JCBL_OFFICIAL_URL,
	immutable: true,
	itemCount: 22,
	items: JCBL_LIST_A_2026_05_01,
	glossary: {
		Natural: "実際に示すスーツ、NTの形、または一般的な強さを直接表すCall。",
		Treatment: "ナチュラルなCallに付随して意味や継続方法を定める取り決め。",
		Convention: "ナチュラルな意味とは異なる情報を体系的に交換する取り決め。",
		CueBid:
			"相手が示したスーツを競ることで、別の強さ・支持・コントロールを表すCall。",
	},
	fullDisclosure:
		"採用した意味、レンジ、例外、継続を相手に正確に説明できる状態を保つ。",
	alertPolicy:
		"各RuleDefinitionのalertはリストA固有の教材メタデータであり、競技会固有の手順説明は対象外。",
} as const;

export type OfficialItemId =
	(typeof JCBL_LIST_A_2026_05_01)[number]["officialItemId"];

export function getRule(officialItemId: string): RuleDefinition | undefined {
	return JCBL_LIST_A_2026_05_01.find(
		(item) => item.officialItemId === officialItemId
	);
}
