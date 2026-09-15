import type { ConventionTermId } from "./convention-terms";
import type { OfficialItemId } from "./ruleset";
import type { SystemSettings } from "./types";

export type SettingPath = {
	[G in keyof SystemSettings]: `${G}.${Extract<keyof SystemSettings[G], string>}`;
}[keyof SystemSettings];

export type ConventionCondition =
	| { kind: "context"; predicate: string; label: string }
	| { kind: "term"; term: ConventionTermId }
	| {
			kind: "compare";
			fact: string;
			label: string;
			operator: "≥" | "≤" | "=" | "<";
			value: number | string;
			settingRef?: SettingPath;
	  };

export interface ConventionRule {
	action: {
		type:
			| "bid"
			| "play"
			| "pass"
			| "double"
			| "redouble"
			| "validate"
			| "defer";
		value: string;
	};
	explanation: string;
	id: string;
	meaning: string;
	/** A condition can permit a call without uniquely requiring it. */
	selection: "CANDIDATE" | "REQUIRED" | "VALIDATION";
	title: string;
	variant: string;
	when: { all: ConventionCondition[] };
}

const context = (predicate: string, label: string): ConventionCondition => ({
	kind: "context",
	predicate,
	label,
});
const compare = (
	fact: string,
	label: string,
	operator: "≥" | "≤" | "=" | "<",
	value: number | string,
	settingRef?: SettingPath
): ConventionCondition => ({
	kind: "compare",
	fact,
	label,
	operator,
	value,
	settingRef,
});
const balanced: ConventionCondition = { kind: "term", term: "balanced" };
const unopened = context(
	"auction.myTurnAndUnopened",
	"自分の番 ∧ まだ誰もオープンしていない（先行Pass可）"
);
const unopposed = context("auction.uncontested", "相手の介入なし ∧ 自分の番");
const opponent = context(
	"auction.opponentSuitOpening",
	"相手のスートオープン後 ∧ 自分の番"
);
const lead = context(
	"play.defenderOpeningLead",
	"守備側の最初のリード ∧ 出すスートは選択済み"
);
const noHonorLead = context(
	"play.noPriorityHonorLead",
	"オナーからの優先リード規則が適用されない"
);

/** Descriptions and parameter annotations are resolved against the selected system version. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Independent catalog entries share a builder; branches are content definitions, not a decision engine.
export function getConventionRules(
	item: OfficialItemId,
	settings: SystemSettings
): ConventionRule[] {
	const {
		opening: o,
		responseRebid: r,
		competitive: c,
		overcall: oc,
	} = settings;
	const fiveCardMajorExplanation = o.oneNtFiveCardMajor
		? "定義に含まれる5枚メジャーの手でも1NTを優先します。"
		: "5枚メジャーの手は1NTの対象から除きます。";
	const rows: ConventionRule[] = [];
	const add = (
		variant: string,
		title: string,
		explanation: string,
		conditions: ConventionCondition[],
		type: ConventionRule["action"]["type"],
		value: string,
		meaning: string,
		selection: ConventionRule["selection"] = "CANDIDATE"
	) => {
		rows.push({
			id: `${item}.${rows.length + 1}`,
			variant,
			title,
			explanation,
			when: { all: conditions },
			action: { type, value },
			meaning,
			selection,
		});
	};
	const minimum = (value: number, ref: SettingPath) =>
		compare("hand.hcp", "HCP", "≥", value, ref);
	const maximum = (value: number, ref: SettingPath) =>
		compare("hand.hcp", "HCP", "≤", value, ref);
	const length = (value: number, ref?: SettingPath) =>
		compare("hand.selectedSuitLength", "対象スートの枚数", "≥", value, ref);
	const askContext = (ask: string) => [
		unopposed,
		context(
			`auction.partnerAsked.${ask}`,
			`パートナーが${ask}で問い合わせた直後の返答`
		),
	];

	switch (item) {
		case "A-OB-01": {
			for (const [level, variant, min, max, minRef, maxRef] of [
				[
					1,
					"Natural 1NT",
					o.oneNtMinHcp,
					o.oneNtMaxHcp,
					"opening.oneNtMinHcp",
					"opening.oneNtMaxHcp",
				],
				[
					2,
					"Natural 2NT",
					o.twoNtMinHcp,
					o.twoNtMaxHcp,
					"opening.twoNtMinHcp",
					"opening.twoNtMaxHcp",
				],
				[
					3,
					"Natural 3NT",
					o.threeNtMinHcp,
					o.threeNtMaxHcp,
					"opening.threeNtMinHcp",
					"opening.threeNtMaxHcp",
				],
				[
					4,
					"Natural 4+-level NT",
					o.fourPlusNtMinHcp,
					o.fourPlusNtMaxHcp,
					"opening.fourPlusNtMinHcp",
					"opening.fourPlusNtMaxHcp",
				],
			] as const) {
				const shape =
					level === 1 && o.allowSingletonTopHonor
						? context(
								"hand.balancedOrAllowed4441",
								"バランスハンド（注釈参照） OR 4441でシングルトンがA/K/Q（1NTの例外設定）"
							)
						: balanced;
				add(
					variant,
					`${level}NT${level === 4 ? "以上" : ""}オープン`,
					`まだ誰もオープンしていないとき、${min}〜${max} HCPで全体設定のバランスハンドなら${level}NT${level === 4 ? "以上" : ""}を候補にします。${level === 1 ? fiveCardMajorExplanation : ""}${level === 1 && o.allowSingletonTopHonor ? "1NTに限り、A・K・Qのシングルトンを持つ4441も例外として許可します。" : ""}`,
					[
						unopened,
						shape,
						minimum(min, minRef),
						maximum(max, maxRef),
						...(level === 1 && !o.oneNtFiveCardMajor
							? [compare("hand.maxMajorLength", "メジャーの最大枚数", "≤", 4)]
							: []),
					],
					"bid",
					`${level}NT${level === 4 ? "以上（強さに応じた代）" : ""}`,
					"設定した点数帯とNTの手の形を示す。1NTは自然な1スートより優先。"
				);
			}
			for (const [suit, min, ref] of [
				["♣", o.oneClubMinLength, "opening.oneClubMinLength"],
				["♦", o.oneDiamondMinLength, "opening.oneDiamondMinLength"],
				["M", o.oneMajorMinLength, "opening.oneMajorMinLength"],
			] as const) {
				add(
					"1-level natural",
					`1${suit}オープン`,
					`${o.oneLevelMinHcp} HCP以上で${suit}が${min}枚以上なら、そのスートでの1の代のオープンを候補にします。1NTや強い2♣の優先規則と照合して選びます。`,
					[
						unopened,
						minimum(o.oneLevelMinHcp, "opening.oneLevelMinHcp"),
						length(min, ref),
					],
					"bid",
					`1${suit}`,
					"実際のスート長とオープンの強さ。Mは♥または♠。"
				);
			}
			add(
				"Natural Strong Two",
				"自然な強い2スート",
				`${o.naturalStrongTwoMinHcp} HCP以上、示すスートが${o.naturalStrongTwoMinLength}枚以上なら強い2オープンの候補です。人工的2♣を採用する場合、2♣はこの自然な方式から除きます。`,
				[
					unopened,
					minimum(o.naturalStrongTwoMinHcp, "opening.naturalStrongTwoMinHcp"),
					length(
						o.naturalStrongTwoMinLength,
						"opening.naturalStrongTwoMinLength"
					),
					context("opening.notArtificial2C", "人工的2♣との重複なし"),
				],
				"bid",
				"2 + 対象スート",
				"強さと実スート。"
			);
			add(
				"Weak Two",
				"弱い2オープン",
				`${o.weakTwoMinHcp}〜${o.weakTwoMaxHcp} HCPで対象スートが5枚以上なら、弱い2オープンの候補です。Rule of 10を採用する場合は、その条件も満たす必要があります。`,
				[
					unopened,
					minimum(o.weakTwoMinHcp, "opening.weakTwoMinHcp"),
					maximum(o.weakTwoMaxHcp, "opening.weakTwoMaxHcp"),
					length(5),
					context(
						"opening.weakTwoDependencies",
						"Rule of 10採用時は合格 ∧ 人工的2♣との重複なし"
					),
				],
				"bid",
				"2 + 対象スート",
				"弱い点数帯と長いスート。5枚はこのアプリの下限設定。"
			);
			add(
				"Rule of 10",
				"Weak Twoの追加条件",
				"弱い2オープンにこの条件を加える場合、HCPとビッドするスートの枚数の合計が10以上であることを確認します。単独でビッドを指示する規則ではありません。",
				[context("opening.weakTwoSelected", "Weak Twoを候補にしている")],
				"validate",
				"HCP + 対象スート枚数 ≥ 10",
				"Weak Twoの使用条件。",
				"VALIDATION"
			);
			for (const [variant, level, min, max, len, prefix] of [
				[
					"Natural 3-level",
					3,
					o.threeLevelMinHcp,
					o.threeLevelMaxHcp,
					o.threeLevelMinLength,
					"threeLevel",
				],
				[
					"Natural 4+-level",
					4,
					o.fourPlusLevelMinHcp,
					o.fourPlusLevelMaxHcp,
					o.fourPlusLevelMinLength,
					"fourPlusLevel",
				],
			] as const) {
				add(
					variant,
					`${level}の代${level === 4 ? "以上" : ""}のスートオープン`,
					`${min}〜${max} HCPで対象スートが${len}枚以上なら、${level}の代${level === 4 ? "以上" : ""}のオープンを候補にします。`,
					[
						unopened,
						minimum(min, `opening.${prefix}MinHcp`),
						maximum(max, `opening.${prefix}MaxHcp`),
						length(len, `opening.${prefix}MinLength`),
					],
					"bid",
					`${level}${level === 4 ? "以上" : ""} + 対象スート`,
					"長いスートと設定された強さ。"
				);
			}
			break;
		}
		case "A-OB-02":
			for (const [variant, min, extra, explanation] of [
				["20+ HCP", 20, [], "20 HCP以上の強い手を2♣で示します。"],
				[
					"17+ HCP loser definition",
					17,
					[
						context(
							"hand.strongTwoLosers",
							"5枚以上メジャーありならルーザー≤4、それ以外は≤3"
						),
					],
					"17 HCP以上に加え、メジャーを主力とする手なら4ルーザー以下、それ以外は3ルーザー以下を2♣で示します。",
				],
				[
					"14+ HCP and 5+ controls",
					14,
					[
						compare("hand.controls", "コントロール数（A=2、K=1）", "≥", 5),
						context(
							"hand.strongTwoLosers",
							"5枚以上メジャーありならルーザー≤4、それ以外は≤3"
						),
					],
					"14 HCP以上、5コントロール以上で、規定のルーザー条件も満たす手を2♣で示します。",
				],
			] as const) {
				add(
					variant,
					"強い2♣の定義",
					explanation,
					[unopened, compare("hand.hcp", "HCP", "≥", min), ...extra],
					"bid",
					"2♣",
					"人工的でフォーシング。クラブの長さは保証しない。"
				);
			}
			break;
		case "A-RR-01":
			for (const [variant, title, min, ref, len] of [
				[
					"Response",
					"自然な応答",
					r.minimumResponseHcp,
					"responseRebid.minimumResponseHcp",
					4,
				],
				[
					"Opener rebid",
					"オープナーのリビッド",
					r.openerRebidMinHcp,
					"responseRebid.openerRebidMinHcp",
					r.openerRebidNewSuitMinLength,
				],
				[
					"Responder rebid",
					"レスポンダーのリビッド",
					r.responderRebidMinHcp,
					"responseRebid.responderRebidMinHcp",
					r.responderRebidNewSuitMinLength,
				],
			] as const) {
				add(
					variant,
					title,
					`パートナーの自然なビッドを受け、自分の役割に対応する下限${min} HCPとスート長を確認して応答します。新スート、サポート、NTで条件が異なるため、形と強さに合う候補を選びます。`,
					[
						unopposed,
						context(`auction.role.${variant}`, `${title}の番`),
						minimum(min, ref),
						context(
							"hand.naturalResponseShape",
							`新スートは原則${len}枚以上（初回2の代の新スートは5枚以上）、支持は3枚以上、NTは採用したNT形`
						),
					],
					"bid",
					"合法な新スート／支持／NT",
					`Invitation下限${r.invitationalMinHcp} HCP、GF下限${r.gameForcingMinHcp} HCP。具体的な代とフォーシング性は経路の合意に従う。`
				);
			}
			break;
		case "A-RR-02": {
			add(
				"Stayman",
				"4枚メジャーを尋ねる",
				`パートナーの1NTに相手がパスしたとき、${r.staymanMinHcp} HCP以上で4枚メジャーを持てば2♣で尋ねます。${r.staymanExcludeFiveCardMajor ? "5枚以上のメジャーを持つ手は通常経路から除きます。" : "5枚以上のメジャーがあっても使える設定です。"}`,
				[
					unopposed,
					context("auction.partner1NT", "partner 1NT → RHO Pass の応答者"),
					minimum(r.staymanMinHcp, "responseRebid.staymanMinHcp"),
					context("hand.hasFourCardMajor", "♥または♠が4枚以上"),
					...(r.staymanExcludeFiveCardMajor
						? [compare("hand.maxMajorLength", "メジャーの最大枚数", "≤", 4)]
						: []),
				],
				"bid",
				"2♣",
				"4枚メジャーを尋ねる。♣の長さを保証しない。",
				"REQUIRED"
			);
			for (const [suit, condition, meaning, description] of [
				[
					"♥",
					r.staymanBothMajorsResponse === "H" ? "♥≥4" : "♥≥4 ∧ ♠<4",
					"4枚以上の♥",
					r.staymanBothMajorsResponse === "H"
						? "ハートを4枚以上持つ"
						: "ハートを4枚以上持ち、スペードは4枚未満である",
				],
				[
					"♠",
					r.staymanBothMajorsResponse === "S" ? "♠≥4" : "♠≥4 ∧ ♥<4",
					"4枚以上の♠",
					r.staymanBothMajorsResponse === "S"
						? "スペードを4枚以上持つ"
						: "スペードを4枚以上持ち、ハートは4枚未満である",
				],
				[
					"♦",
					"♥<4 ∧ ♠<4",
					"4枚メジャーなし。♦の長さを保証しない",
					"ハートもスペードも4枚ない",
				],
			]) {
				add(
					"Stayman",
					`2${suit}で返答`,
					`自分の1NTにパートナーが2♣で尋ねたら、${description}場合は2${suit}と返答します。両方のメジャーが4枚なら${r.staymanBothMajorsResponse === "H" ? "ハート" : "スペード"}を先に示す設定です。`,
					[
						...askContext("Stayman 2♣"),
						context(`hand.staymanReply.${suit}`, condition ?? ""),
					],
					"bid",
					`2${suit}`,
					meaning ?? "",
					"REQUIRED"
				);
			}
			if (r.weakStayman) {
				add(
					"Stayman",
					"弱い手の追加経路",
					`通常の下限${r.staymanMinHcp} HCPに届かなくても、両メジャー4枚ずつ、ダイヤ4枚以上なら2♣を使います。どの返答にもパスできる形を利用する約束です。`,
					[
						unopposed,
						context("auction.partner1NT", "partner 1NT → RHO Pass"),
						compare(
							"hand.hcp",
							"HCP",
							"<",
							r.staymanMinHcp,
							"responseRebid.staymanMinHcp"
						),
						context("hand.weakStaymanShape", "♠=4 ∧ ♥=4 ∧ ♦≥4"),
					],
					"bid",
					"2♣",
					"弱い手で切札のあるコントラクトを探す。",
					"REQUIRED"
				);
				add(
					"Stayman",
					"弱い経路で止まる",
					"この弱い経路で2♣を使った本人は、相手の介入がなければ、パートナーの2♦・2♥・2♠にパスします。",
					[
						unopposed,
						context(
							"auction.usedWeakStayman",
							"弱い経路で2♣を使った本人 ∧ partnerの返答が2♦/2♥/2♠"
						),
					],
					"pass",
					"Pass",
					"返答スートを切札に止まる。",
					"REQUIRED"
				);
			}
			break;
		}
		case "A-RR-03":
			add(
				"Artificial 2D response",
				"弱い2♦応答",
				`パートナーの人工的2♣に対し、${r.weakResponseMaxHcp} HCP以下を2♦で示します。このアプリの初期方式は弱い応答で、強い手も含む待機型とは区別します。`,
				[
					unopposed,
					context(
						"auction.partnerStrong2C",
						"partner 強い人工的2♣への初回応答"
					),
					maximum(r.weakResponseMaxHcp, "responseRebid.weakResponseMaxHcp"),
				],
				"bid",
				"2♦",
				"弱い応答。♦の長さは保証しない。",
				"REQUIRED"
			);
			break;
		case "A-RR-04":
			add(
				"Weak 2NT response",
				"弱い2NT応答",
				`パートナーの自然な強い2♦・2♥・2♠に対し、${r.weakResponseMaxHcp} HCP以下なら2NTで弱さを示します。Weak Twoへの問い合わせとは異なります。`,
				[
					unopposed,
					context(
						"auction.partnerNaturalStrongTwo",
						"partner 自然な強い2スートへの応答"
					),
					maximum(r.weakResponseMaxHcp, "responseRebid.weakResponseMaxHcp"),
				],
				"bid",
				"2NT",
				"弱い手。NTをプレイする提案とは限らない。",
				"REQUIRED"
			);
			break;
		case "A-RR-05":
			for (const variant of ["Feature ask", "Ogust-style ask"]) {
				add(
					variant,
					"2NTで問い合わせ",
					`パートナーのWeak Twoに対し${r.weakTwoInquiryMinHcp} HCP以上なら、2NTで${variant === "Feature ask" ? "サイドスートの絵札" : "強さとスートの品質"}を尋ねます。`,
					[
						unopposed,
						context("auction.partnerWeakTwo", "partner Weak Twoへの初回応答"),
						minimum(
							r.weakTwoInquiryMinHcp,
							"responseRebid.weakTwoInquiryMinHcp"
						),
					],
					"bid",
					"2NT",
					"問い合わせ。NTの形を保証しない。"
				);
			}
			add(
				"Feature ask",
				"Featureの返答",
				`Weak Twoへの2NTに、自分のサイドスートに${r.weakTwoFeatureMinimumHonor === "A" ? "A" : "AまたはK"}が1スートだけあれば、そのスートを3の代で示します。なければ元のスートを3の代で繰り返し、複数なら優先順が未確定なので判定を保留します。`,
				[
					...askContext("Weak Twoへの2NT"),
					context(
						"hand.featureCount",
						"採用した最低オナー以上のFeature数を数える"
					),
				],
				"bid",
				"Featureが1つ：3 + そのスート／なし：3 + 元のスート／複数：判定保留",
				"サイドの絵札の所在。"
			);
			for (const [state, call] of [
				["minimum ∧ poor", "3♣"],
				["minimum ∧ good", "3♦"],
				["maximum ∧ poor", "3♥"],
				["maximum ∧ good", "3♠"],
				["AKQをすべて持つ（優先）", "3NT"],
			]) {
				add(
					"Ogust-style ask",
					`Ogust ${call}`,
					`2NTへの返答で${state}なら${call}。maximumは${r.weakTwoOgustMaximumMinHcp} HCP以上、goodは元のスートのAKQが${r.weakTwoOgustGoodSuitTopHonors}枚以上です。AKQ全部の3NTを先に適用します。`,
					[
						...askContext("Weak Twoへの2NT"),
						context(`hand.ogust.${call}`, state ?? ""),
					],
					"bid",
					call ?? "",
					"強さとスートの品質を段階で示す。",
					"REQUIRED"
				);
			}
			break;
		case "A-RR-06":
			for (const [variant, call, rank, min] of [
				["Blackwood", "4NT", "A", r.blackwoodMinHcp],
				["5NT king ask", "5NT", "K", r.blackwoodMinHcp],
			] as const) {
				add(
					variant,
					`${rank}を尋ねる`,
					`切札を合意してスラムを検討するとき、${call}で${rank}の枚数を尋ねます。${min} HCPはこのアプリの目安であり、点数だけでスラムを決める約束ではありません。5NTはAの問い合わせ後に使用します。`,
					[
						unopposed,
						context(
							"auction.trumpAgreedAndSlamAsk",
							"切札合意 ∧ スラムの問い合わせを選択（5NTはA ask後）"
						),
						minimum(min, "responseRebid.blackwoodMinHcp"),
					],
					"bid",
					call,
					`${rank}の枚数を尋ねる。RKCBの5キーカードとは別方式。`
				);
				for (const [count, suit] of [
					["0または4", "♣"],
					["1", "♦"],
					["2", "♥"],
					["3", "♠"],
				]) {
					add(
						variant,
						`${rank}の枚数を返答`,
						`${rank}が${count}枚なら${rank === "A" ? "5" : "6"}${suit}と答えます。`,
						[
							...askContext(call),
							compare(`hand.${rank}Count`, `${rank}枚数`, "=", count ?? ""),
						],
						"bid",
						`${rank === "A" ? "5" : "6"}${suit}`,
						`${rank}が${count}枚。`,
						"REQUIRED"
					);
				}
			}
			for (const variant of ["DOPI", "DEPO", "ROPI"]) {
				add(
					variant,
					"相手の介入への返答",
					variant === "DEPO"
						? "Blackwoodへのビッド介入後、対象オナーが偶数ならDouble、奇数ならPassで返答します。"
						: `${variant === "ROPI" ? "Double介入にはRedouble" : "ビッド介入にはDouble"}で0枚、Passで1枚、最も低い合法ビッドで2枚、次で3枚を示す設定です。4枚の場合の対応は別途確認します。`,
					[
						context(
							`auction.blackwoodInterference.${variant}`,
							variant === "ROPI"
								? "Blackwoodへの相手のDouble後"
								: "Blackwoodへの相手のビッド介入後"
						),
					],
					"bid",
					variant === "DEPO"
						? "偶数：X／奇数：Pass"
						: `${variant === "ROPI" ? "XX" : "X"}：0／Pass：1／第1・第2ステップ：2・3`,
					"介入下でも対象オナーの枚数を伝える。"
				);
			}
			break;
		case "A-RR-07":
			for (const [variant, ask, rank, level] of [
				["4C ace ask", "4♣", "A", 4],
				["5C king ask", "5♣", "K", 5],
			] as const) {
				add(
					variant,
					`Gerber ${ask}`,
					`自然なNTを起点とする合意された経路で${ask}により${rank}の枚数を尋ねます。5♣は4♣によるA askの後に使用します。`,
					[
						unopposed,
						context(
							"auction.gerberContext",
							"自然NTの経路（5♣はGerber A ask後）"
						),
						minimum(r.gerberMinHcp, "responseRebid.gerberMinHcp"),
					],
					"bid",
					ask,
					`${rank}を尋ねる。クラブの長さは保証しない。`
				);
				for (const [count, call] of [
					["0または4", `${level}♦`],
					["1", `${level}♥`],
					["2", `${level}♠`],
					["3", `${level}NT`],
				]) {
					add(
						variant,
						`${rank}の枚数を返答`,
						`${rank}が${count}枚なら${call}で返答します。`,
						[
							...askContext(ask),
							compare(`hand.${rank}Count`, `${rank}枚数`, "=", count ?? ""),
						],
						"bid",
						call ?? "",
						`${rank}が${count}枚。`,
						"REQUIRED"
					);
				}
			}
			break;
		case "A-RR-08":
			add(
				"Grand Slam Force",
				"5NTで切札の品質を尋ねる",
				"切札を合意してグランドスラムを検討するとき、5NTで切札のA・K・Qの保有枚数を尋ねます。Blackwood後のKing askと同じ5NTを使うため、どちらの経路かを先に確定します。",
				[
					unopposed,
					context("auction.gsfNotKingAsk", "切札合意 ∧ King askの経路ではない"),
					minimum(r.grandSlamForceMinHcp, "responseRebid.grandSlamForceMinHcp"),
				],
				"bid",
				"5NT",
				"切札のトップオナーを尋ねる。"
			);
			add(
				"Grand Slam Force",
				"6または7で返答",
				`切札のAKQを${r.grandSlamForceGrandTopHonors}枚以上持てば7の代の切札、足りなければ6の代の切札で返答します。`,
				askContext("Grand Slam Force 5NT"),
				"bid",
				`切札AKQ ≥ ${r.grandSlamForceGrandTopHonors}：7切札／未満：6切札`,
				"切札のトップオナーの保有条件。",
				"REQUIRED"
			);
			break;
		case "A-RR-09":
			for (const [variant, name] of [
				["Stayman eligibility", "Stayman"],
				["Gerber eligibility", "Gerber"],
			]) {
				add(
					variant ?? "",
					`${name}の設定検査`,
					`リストAで${name}を使う自然な1NTは、下限15 HCP以上、上限と下限の差が5 HCP以内であることを保存した設定から検査します。自然な弱い1NTそのものを禁止する条件ではありません。`,
					[context(`system.adopts.${name}`, `${name}を採用`)],
					"validate",
					`1NT下限 ${o.oneNtMinHcp} ≥ 15 AND 幅 ${o.oneNtMaxHcp - o.oneNtMinHcp} ≤ 5`,
					"ビッド指示ではなく設定の組合せの制約。",
					"VALIDATION"
				);
			}
			break;
		case "A-RR-10":
			add(
				"Fit-showing jump",
				"支持を伴うジャンプシフト",
				`パートナーのスートを3枚以上支持し、示す別スートとの合計が9枚以上、${r.fitShowingJumpMinHcp} HCP以上なら、その別スートへのジャンプを候補にします。`,
				[
					unopposed,
					context(
						"auction.partnerSuitOpening",
						"partnerのスートオープンへの応答"
					),
					minimum(r.fitShowingJumpMinHcp, "responseRebid.fitShowingJumpMinHcp"),
					compare("hand.supportLength", "支持枚数", "≥", 3),
					compare("hand.supportAndNewSuitLength", "支持＋新スート枚数", "≥", 9),
				],
				"bid",
				"新スートへの合法なジャンプ",
				"支持と新スートの実長を同時に約束。"
			);
			break;
		case "A-CD-01":
			for (const [variant, level, min, len, prefix] of [
				["One-level", 1, oc.oneLevelMinHcp, oc.oneLevelMinLength, "oneLevel"],
				["Two-level", 2, oc.twoLevelMinHcp, oc.twoLevelMinLength, "twoLevel"],
			] as const) {
				add(
					variant,
					`${level}の代のオーバーコール`,
					`相手のオープン後、${min} HCP以上で対象スートが${len}枚以上なら、${level}の代でそのスートを競る候補にします。相手と同じスートを示すCue Bidは除きます。`,
					[
						opponent,
						minimum(min, `overcall.${prefix}MinHcp`),
						length(len, `overcall.${prefix}MinLength`),
						context(
							"auction.legalNonCueSuitBid",
							`${level}の代の合法な新スートビッド`
						),
					],
					"bid",
					`${level} + 対象スート`,
					"実際のスートと強さ。"
				);
			}
			break;
		case "A-CD-02":
			for (const [variant, suits] of [
				["Minors", "両マイナー"],
				["Two lowest unbid", "低い未ビッド2スート"],
			]) {
				add(
					variant ?? "",
					"2スートをNTで示す",
					`相手のオープン後、${suits}を5枚と4枚以上持てば、NTで2スートを示す候補にします。先にパスしていない手は2NT以上が必要です。`,
					[
						opponent,
						context(`hand.twoSuit.${variant}`, `${suits}の長い方≥5 ∧ 短い方≥4`),
						context(
							"auction.unusualNtLevel",
							"未パスなら2NT以上／既パスなら採用した合法なNTの代"
						),
					],
					"bid",
					"合意した代のNT",
					"自然なNTではなく特定の2スート。"
				);
			}
			break;
		case "A-CD-03":
			for (const [variant, min, ref] of [
				["Direct", c.takeoutDoubleMinHcp, "competitive.takeoutDoubleMinHcp"],
				[
					"Balancing",
					c.balancingTakeoutDoubleMinHcp,
					"competitive.balancingTakeoutDoubleMinHcp",
				],
			] as const) {
				add(
					variant,
					"テイクアウトDouble",
					`相手のスートが2枚以下で、他のスートに対応でき、${min} HCP以上ならDoubleを候補にします。このアプリの形の下限は他の3スート中2つ以上が3枚以上です。`,
					[
						opponent,
						context(
							`auction.takeout.${variant}`,
							variant === "Balancing"
								? "相手のビッド後に2人がPassした位置"
								: "直接の競争位置"
						),
						minimum(min, ref),
						compare("hand.opponentSuitLength", "相手スートの枚数", "≤", 2),
						context("hand.takeoutSupport", "他のスートのうち2つ以上が3枚以上"),
					],
					"double",
					"X",
					"他スートへの対応力。ペナルティを主目的としない。"
				);
			}
			break;
		case "A-CD-04":
			add(
				"Lightner",
				"通常外のリードを要求",
				"相手のスートスラムに対して、通常とは異なるリードを要求する合意がある場合にDoubleします。ボイドは手掛かりですが、要求するスートを判断できない場面は保留します。",
				[
					context(
						"auction.opponentSuitSlam",
						"相手が6または7の代のスート契約 ∧ 自分の番"
					),
					...(c.lightnerRequireVoid
						? [context("hand.sideSuitVoid", "切札以外にボイドがある")]
						: []),
					context(
						"defense.unusualLeadRequest",
						"通常外のリード要求の意図を確認"
					),
				],
				"double",
				"X",
				"通常外のリード要求。NTスラムや意図不明は判定保留。"
			);
			break;
		case "A-CD-05":
			add(
				"Negative double",
				"未ビッドメジャーを示す",
				`パートナーのオープンに相手が${c.negativeDoubleMaxLevel}の代以下でオーバーコールした後、${c.negativeDoubleMinHcp} HCP以上で未ビッドメジャーを4枚以上持てばDoubleを候補にします。`,
				[
					context(
						"auction.partnerOpenOpponentOvercall",
						"partner open → opponent overcall → 自分の番"
					),
					minimum(c.negativeDoubleMinHcp, "competitive.negativeDoubleMinHcp"),
					compare(
						"auction.overcallLevel",
						"介入の代",
						"≤",
						c.negativeDoubleMaxLevel,
						"competitive.negativeDoubleMaxLevel"
					),
					context("hand.unbidMajorFour", "未ビッドメジャーが4枚以上"),
				],
				"double",
				"X",
				"未ビッドスートへの対応。"
			);
			break;
		case "A-CD-06":
			add(
				"SOS redouble",
				"別のコントラクトへ逃げる",
				`味方の2の代以下の契約がDoubleされ、自分が${c.sosRedoubleMaxHcp} HCP以下で4枚以上のスートを2つ以上持つとき、Redoubleで逃げ先を探す候補にします。`,
				[
					context(
						"auction.ownLowContractDoubled",
						"味方の2の代以下の契約がペナルティDouble ∧ 自分の番"
					),
					maximum(c.sosRedoubleMaxHcp, "competitive.sosRedoubleMaxHcp"),
					compare("hand.fourCardSuitCount", "4枚以上のスート数", "≥", 2),
				],
				"redouble",
				"XX",
				"救出を要求。強さを示すRedoubleではない。"
			);
			break;
		case "A-CD-07":
			add(
				"Game force cue bid",
				"ゲームフォースのCue Bid",
				`相手のスートをビッドすることでゲームフォースを示す方式です。この設定では${c.gameForcingCueMinHcp} HCP以上を強さの下限とし、他のCue Bidの用途と区別した経路で使います。`,
				[
					opponent,
					minimum(c.gameForcingCueMinHcp, "competitive.gameForcingCueMinHcp"),
					context(
						"auction.gfCueContext",
						"Support Cue等ではなくGF Cueを使う経路"
					),
				],
				"bid",
				"相手スートの合法なCue Bid",
				"ゲームフォース以上。"
			);
			break;
		case "A-CD-08":
			add(
				"Limit raise or better",
				"支持を示すCue Bid",
				`パートナーがオーバーコールした後、そのスートを3枚以上支持し、${c.supportCueMinHcp} HCP以上なら、相手スートのCue BidでInvitation以上の支持を示します。`,
				[
					context(
						"auction.partnerOvercall",
						"相手open → partner overcall → 自分の番"
					),
					minimum(c.supportCueMinHcp, "competitive.supportCueMinHcp"),
					compare("hand.supportLength", "支持枚数", "≥", 3),
				],
				"bid",
				"相手スートの合法なCue Bid",
				"Limit raise以上の支持。"
			);
			break;
		case "A-CA-01":
			for (const rank of ["A", "K"]) {
				add(
					`${rank} from AK`,
					"AKからのリード",
					`選んだスートにAとKがあれば${rank}からリードします。どちらから出すかは方式として一方を選びます。`,
					[lead, context("hand.selectedSuitAK", "選んだスートにAとK")],
					"play",
					rank,
					"AKからの採用リード。スート選択は別の判断。",
					"REQUIRED"
				);
			}
			add(
				"Honor sequence",
				"連続オナーのトップ",
				"KQJなど連続するオナーを持つ場合は、その最上位からリードします。AKからの合意が適用される場合はそちらを先に使います。",
				[
					lead,
					context(
						"hand.honorSequence",
						"連続するオナーあり ∧ AKの優先規則なし"
					),
				],
				"play",
				"top(sequence)",
				"連続オナーのトップ。",
				"REQUIRED"
			);
			for (const [variant, size, action, explanation] of [
				[
					"Fourth highest",
					4,
					"nthHighest(selectedSuit, 4)",
					"オナーの優先規則がなく、選んだスートが4枚以上なら、上から4番目を出します。",
				],
				[
					"Top of Nothing",
					1,
					"highest(selectedSuit)",
					"選んだスートにオナーがなければ、最も高い小札を出します。",
				],
				[
					"MUD",
					3,
					"nthHighest(selectedSuit, 2)",
					"オナーのない3枚のスートから、中・上・下の順で出す約束です。最初は真ん中の札を出します。",
				],
			] as const) {
				add(
					variant,
					"小札からのリード",
					explanation,
					[
						lead,
						noHonorLead,
						context("hand.noHonorInSelectedSuit", "選んだスートにA/K/Q/Jなし"),
						compare(
							"hand.selectedSuitLength",
							"選んだスートの枚数",
							variant === "MUD" ? "=" : "≥",
							size
						),
					],
					"play",
					action,
					"枚数・小札の持ち方に関する約束。",
					"REQUIRED"
				);
			}
			break;
		case "A-CA-02":
			add(
				"Normal attitude",
				"継続を希望する信号",
				"アティチュードを送る場面では、高い小札でそのスートの継続を希望し、低い小札で希望しないことを伝えます。どのスートを希望するか判断できない場合は自動評価を保留します。",
				[
					context(
						"signal.attitudeContext",
						"守備側 ∧ Attitudeを送る場面 ∧ 安全な小札を選択可能"
					),
				],
				"play",
				"希望：high／希望しない：low",
				"スートへの興味。",
				"REQUIRED"
			);
			for (const [parity, sequence] of [
				["偶数", "high → low"],
				["奇数", "low → high"],
			]) {
				add(
					"Count",
					"枚数の偶奇を示す",
					`カウントを伝える場面で、シグナル開始時の枚数が${parity}なら${sequence === "high → low" ? "高い札、低い札" : "低い札、高い札"}の順で出します。強制された札やトリックを損なう札は信号として扱いません。`,
					[
						context(
							"signal.countContext",
							"守備側 ∧ 切札以外にフォロー ∧ Countを送る場面"
						),
						compare("signal.startingParity", "開始時の枚数", "=", parity ?? ""),
						context("play.safeSignalChoice", "安全に選べる小札が2枚以上"),
					],
					"play",
					sequence ?? "",
					`${parity}枚を示す。`,
					"REQUIRED"
				);
			}
			add(
				"Suit preference",
				"別スートの希望",
				"スートプリファレンスを送る場面では、高い札で対象2スートの高位、低い札で低位のスートを希望します。対象スートと信号の用途が確定していなければ判定を保留します。",
				[
					context(
						"signal.preferenceContext",
						"守備側 ∧ Suit Preferenceの場面 ∧ 対象2スートと安全な選択肢を確認"
					),
				],
				"play",
				"高位スート希望：high／低位スート希望：low",
				"別スートへの希望。",
				"REQUIRED"
			);
			break;
		default:
			break;
	}
	return rows;
}

const jcblCard =
	"https://jcbl.sakura.ne.jp/handbook/HB2024p131-139コンベンションカード記入方法.pdf";
const funbridgeFaq = "https://funbridge.com/faq/playing-conventions";
const funbridgeUpdate =
	"https://funbridge.com/blog/en/discover-the-new-bidding-systems-available-on-funbridge/";

export const conventionSources: Record<
	OfficialItemId,
	{ jcbl: string; funbridge: string; jcblUrl: string; funbridgeUrl: string }
> = Object.fromEntries(
	Object.entries({
		"A-OB-01": [
			"NOTRUMP OPENING BIDS / MAJOR OPENING / MINOR OPENING / TWO LEVEL",
			"Bidding conventions → Edit my system。1NTレンジ・5枚メジャーの個別設定名は未確認。",
		],
		"A-OB-02": [
			"2♣（強い人工的オープンの記述欄）",
			"Bidding conventions → 選択システムの2♣。JCBLの強い手の定義との一対一対応は未確認。",
		],
		"A-RR-01": [
			"RESPONSES / REBIDS（各オープンの欄）",
			"Bidding conventions → Edit my system。Response/Rebidの個別設定名は未確認。",
		],
		"A-RR-02": [
			"NOTRUMP OPENING BIDS → 2♣ Stayman",
			"Bidding conventions → Stayman。weak Stayman (option)は公式追加案内で確認。弱い手の形はペアの設定例。",
		],
		"A-RR-03": [
			"2♣ → RESPONSES",
			"選択システムの強い2♣への応答。個別設定名・待機／弱い応答の一致は未確認。",
		],
		"A-RR-04": [
			"TWO LEVEL → RESPONSES",
			"自然なStrong Twoを採用するシステムの応答。独立した設定項目は未確認。",
		],
		"A-RR-05": [
			"TWO LEVEL → 2NT inquiry / RESPONSES",
			"Weak Twoへの応答方式の追加を公式案内で確認。Feature/Ogustの細部の一致は未確認。",
		],
		"A-RR-06": [
			"SLAM CONVENTIONS → Blackwood / DOPI / DEPO / ROPI",
			"Bidding conventions → Blackwood。選択システムに依存し、DOPI等の個別設定名は未確認。",
		],
		"A-RR-07": [
			"SLAM CONVENTIONS → Gerber",
			"選択システムのGerber。個別設定名は未確認。",
		],
		"A-RR-08": [
			"SLAM CONVENTIONS（5NTの意味を記載）",
			"選択システムの5NT。Grand Slam Forceの独立した設定名は未確認。",
		],
		"A-RR-09": [
			"NOTRUMP OPENING BIDS → 1NT range（使用資格はリスト本文）",
			"JCBLリストAの使用資格に対応する設定項目はなし。1NTレンジを照合。",
		],
		"A-RR-10": [
			"RESPONSES → Jump shifts / OTHER CONVENTIONS",
			"Fit-showing Jumpの個別設定名は未確認。",
		],
		"A-CD-01": [
			"OVERCALLS",
			"Bidding conventions → 選択システムのOvercalls。個別閾値は未確認。",
		],
		"A-CD-02": [
			"JUMP OVERCALL / UNUSUAL NT（2スートの説明）",
			"Bidding conventions → 選択システムのUnusual NT。個別設定名・長さの一致は未確認。",
		],
		"A-CD-03": [
			"TAKEOUT DOUBLES",
			"Bidding conventions → 選択システムのTakeout Double。閾値の一致は未確認。",
		],
		"A-CD-04": [
			"SPECIAL DOUBLES / OTHER CONVENTIONS",
			"Lightner Doubleの独立した設定項目は未確認。",
		],
		"A-CD-05": [
			"SPECIAL DOUBLES → Negative（上限を記載）",
			"選択システムのNegative Double。上限の個別設定名は未確認。",
		],
		"A-CD-06": [
			"REDOUBLES / OTHER CONVENTIONS",
			"SOS Redoubleの独立した設定項目は未確認。",
		],
		"A-CD-07": [
			"DIRECT CUEBID / OTHER CONVENTIONS",
			"選択システムのCue Bid。ゲームフォース用途の一致は未確認。",
		],
		"A-CD-08": [
			"OVERCALLS → RESPONSES / CUEBID",
			"選択システムのCue Bidによる支持。個別設定名は未確認。",
		],
		"A-CA-01": [
			"OPENING LEADS / LENGTH LEADS → 4th best",
			"Card play conventions → Classic：NTは4th best、スートは3rd/5th。3rd/5thはリストB以上のため、現在のリストAに一括採用しない。",
		],
		"A-CA-02": [
			"DEFENSIVE CARDING → Standard / Upside-Down",
			"Card play conventions → UDCAは公式追加案内で確認。逆向きはリストC以上の比較対象で、現在のリストAではStandardを使用。",
		],
	}).map(([id, [jcbl, funbridge]]) => [
		id,
		{
			jcbl,
			funbridge,
			jcblUrl: jcblCard,
			funbridgeUrl: ["A-RR-02", "A-RR-05", "A-CA-02"].includes(id)
				? funbridgeUpdate
				: funbridgeFaq,
		},
	])
) as Record<
	OfficialItemId,
	{ jcbl: string; funbridge: string; jcblUrl: string; funbridgeUrl: string }
>;
