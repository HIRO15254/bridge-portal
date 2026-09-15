import type { OfficialItemId } from "@bridge-portal/domain";

export interface RuleGuide {
	check: string;
	continuation: string;
	meaning: string;
	variantNotes: Readonly<Record<string, string>>;
	when: string;
}

// Explanatory copy, not a replacement for the immutable JCBL ruleset or a pair's System.
export const ruleGuides: Readonly<Record<OfficialItemId, RuleGuide>> = {
	"A-OB-01": {
		when: "まだ誰もオープンしておらず、自分が最初のBidを選ぶとき。",
		meaning:
			"Bidしたスーツの実際の長さ、またはNTの形と強さを、採用したレンジで示します。",
		continuation:
			"パートナーはオープンのレンジとスーツ長を前提にResponseを選びます。",
		check:
			"Weak Twoはビッドスーツ5枚以上で、HCP＋そのスーツの枚数が10以上必要です。具体的なHCPレンジ・長さ・NTの形はMy Systemで定めます。",
		variantNotes: {
			"1-level natural": "1♣〜1♠で実スーツとオープンの強さを示す。",
			"Natural 1NT": "1NTで合意した強さとNTの形を示す。",
			"Natural 2NT": "2NTで合意した強さとNTの形を示す。",
			"Natural 3NT": "3NTを自然なNTオープンとして使う。",
			"Natural 4+-level NT": "4NT以上を自然なNTオープンとして使う。",
			"Natural Strong Two": "2♦・2♥・2♠などで強い実スーツを示す。",
			"Weak Two":
				"2-levelで弱いハンドと5枚以上の実スーツを示す。HCP＋スーツ枚数は10以上。",
			"Natural 3-level": "3-levelで実スーツを示す。",
			"Natural 4+-level": "4-level以上で実スーツを示す。",
			"Rule of 10":
				"Weak TwoのHCP＋ビッドスーツ枚数は10以上。10未満のWeak TwoはリストAでは使用不可。",
		},
	},
	"A-OB-02": {
		when: "オープンする番に、リストAで定められた強いハンドの定義を満たすとき。",
		meaning: "2♣はクラブの実枚数ではなく、強いフォーシングハンドを示します。",
		continuation:
			"2♦などの人工的なResponseを使うなら、その意味とオープナーの次のBidをペアで決めます。",
		check:
			"20+ HCP、17+ HCPとルーザー数、14+ HCP・5+コントロールとルーザー数のいずれかの定義を満たすか確認します。",
		variantNotes: {
			"20+ HCP": "少なくとも20 HCPを持つ強いハンド。",
			"17+ HCP loser definition":
				"17+ HCPに加え、メジャー4／マイナー3ルーザー以下。",
			"14+ HCP and 5+ controls":
				"14+ HCP・5+コントロールに加え、同じルーザー条件。",
		},
	},
	"A-RR-01": {
		when: "パートナーの自然なBidに応答するか、最初のResponse後に再度Bidするとき。",
		meaning:
			"Bidした実スーツ、NTの形、強さ、フォーシング性をペアの合意どおりに示します。",
		continuation:
			"次のBidは直前のレンジ・スーツ長・フォーシング性を踏まえて判断します。",
		check:
			"同じCallでもAuctionの順序で意味が変わります。Opening、Response、Opener rebid、Responder rebidを別々に設定します。",
		variantNotes: {
			Response: "パートナーのOpeningに対する最初の自然な応答。",
			"Opener rebid": "Responseを受けたオープナーの自然な再Bid。",
			"Responder rebid": "オープナーの再Bidを受けたレスポンダーの自然な再Bid。",
		},
	},
	"A-RR-02": {
		when: "NTオープンの直後、4枚メジャーのフィットを探すとき。",
		meaning:
			"すぐ上の♣を人工的にBidし、オープナーの4枚メジャーを問い合わせます（例：1NT–2♣）。",
		continuation:
			"オープナーの返答と、その後のレスポンダーのBidの意味をMy Systemで合意します。",
		check:
			"Natural 1NTでStaymanを使う場合は下限15 HCP以上、レンジ幅5 HCP以内です。NTオープン全般に関する定義と混同しないでください。",
		variantNotes: {
			Stayman: "NTオープンの後、すぐ上の♣で4枚メジャーの有無を尋ねる。",
		},
	},
	"A-RR-03": {
		when: "パートナーがStrong Artificial Forcing 2♣をオープンした直後。",
		meaning: "2♦はダイヤの実枚数を保証しない人工的なResponseです。",
		continuation:
			"待機、弱いハンドなど、2♦の意味と続く再BidをMy Systemに明記します。",
		check:
			"Natural Strong TwoへのResponseとは別の取り決めです。2♣自体の強いハンド条件も確認します。",
		variantNotes: {
			"Artificial 2D response": "強い人工的2♣に対する、実ダイヤを示さない2♦。",
		},
	},
	"A-RR-04": {
		when: "パートナーが実スーツを示すNatural Strong Twoをオープンし、自分が合意した弱いハンドのとき。",
		meaning: "2NTで弱いResponseを示し、通常の自然なNTの意味では使いません。",
		continuation: "オープナーの再Bidと、その後の継続をペアで決めます。",
		check:
			"人工的2♣への2♦、Weak Twoへの2NT Inquiryと混同しないでください。弱いレンジはMy Systemで定めます。",
		variantNotes: {
			"Weak 2NT response": "Natural Strong Twoの後、弱さを示す人工的な2NT。",
		},
	},
	"A-RR-05": {
		when: "パートナーがWeak Twoをオープンし、ゲームの可否を判断する情報が必要なとき。",
		meaning:
			"2NTは自然なNT提案ではなく、強さ・Feature・トランプの質などを尋ねます。",
		continuation:
			"何を尋ね、オープナーの各返答が何を意味するかをMy Systemで決めます。",
		check:
			"Feature askとOgust型の返答を混ぜないでください。Weak Twoの適格性はOpening側でも確認します。",
		variantNotes: {
			"Feature ask":
				"オープナーのFeatureを問い合わせる方式。返答表はペア合意。",
			"Ogust-style ask":
				"強さとスーツ品質を段階的に問い合わせる方式。返答表はペア合意。",
		},
	},
	"A-RR-06": {
		when: "トランプ合意後にスラムを検討し、A・Kの枚数を確認するとき。",
		meaning:
			"4NTでA、後続の5NTでKを尋ねます。妨害を受けた場合の応答方式も選べます。",
		continuation:
			"通常時の段階応答と、介入後にDouble／Pass／Redoubleをどう数えるかをMy Systemで合意します。",
		check:
			"4NT・5NTが常にBlackwoodとは限りません。Auctionの文脈、トランプ合意、妨害の有無を先に確認します。",
		variantNotes: {
			Blackwood: "4NTによるAの枚数の問い合わせ。",
			"5NT king ask": "A問い合わせ後の5NTによるKの枚数の問い合わせ。",
			DOPI: "妨害後、Double＝0、Pass＝1から数える応答方式。",
			DEPO: "妨害後、Double＝偶数、Pass＝奇数を示す応答方式。",
			ROPI: "相手のDouble後、Redouble＝0、Pass＝1から数える応答方式。",
		},
	},
	"A-RR-07": {
		when: "Natural NTを起点に、スラムのためA・Kの枚数を確認するとき。",
		meaning: "4♣でA、後続の5♣でKを尋ねる人工的なCallです。",
		continuation:
			"何枚をどのステップで返すか、どのNT Auctionで使うかをMy Systemで決めます。",
		check:
			"Gerberを使うNatural 1NTにも下限15 HCP・レンジ幅5 HCP以内の制限があります。4♣が自然なクラブの局面と区別します。",
		variantNotes: {
			"4C ace ask": "4♣でAの枚数を尋ねる。",
			"5C king ask": "後続の5♣でKの枚数を尋ねる。",
		},
	},
	"A-RR-08": {
		when: "トランプが合意済みで、グランドスラムを検討するとき。",
		meaning: "5NTでトランプのトップアナーの内容を問い合わせます。",
		continuation:
			"パートナーの返答と、グランドへ進む条件をMy Systemで定めます。",
		check:
			"同じ5NTでもBlackwood後のKing askとは意味が異なります。直前のAuctionを確認します。",
		variantNotes: {
			"Grand Slam Force": "5NTで合意トランプのトップアナーを尋ねる。",
		},
	},
	"A-RR-09": {
		when: "Natural 1NTの後にStaymanまたはGerberを採用するとき。",
		meaning: "1NTの下限は15 HCP以上、上限と下限の差は5 HCP以内にします。",
		continuation:
			"My Systemの1NT min/maxを確定してから、該当Conventionを採用します。",
		check:
			"これは1NTオープンの条件であり、StaymanやGerberの応答段階そのものではありません。",
		variantNotes: {
			"Stayman eligibility": "Staymanを使う1NTレンジが条件内か確認。",
			"Gerber eligibility": "Gerberを使う1NTレンジが条件内か確認。",
		},
	},
	"A-RR-10": {
		when: "パートナーのスーツを支持し、自分の実スーツもジャンプして示すとき。",
		meaning:
			"ジャンプ先の実スーツとパートナーのスーツへのサポートを同時に示します。",
		continuation:
			"パートナーは両スーツの合計枚数と強さの合意を踏まえ、次のコントラクトを選びます。",
		check:
			"2スーツの合計9枚以上を確認します。単なる強いジャンプシフトとは区別します。",
		variantNotes: {
			"Fit-showing jump":
				"実スーツへのジャンプとオープナースーツの支持を同時に示す。",
		},
	},
	"A-CD-01": {
		when: "相手のOpening後に、自分の実スーツで競りに参加するとき。",
		meaning: "オーバーコールしたスーツの長さと合意した強さを示します。",
		continuation:
			"パートナーはレベル別のレンジを前提に支持・新スーツ・NTを選びます。",
		check:
			"1-levelと2-levelで必要な強さやスーツ長を別に設定します。Unusual NTのような2スーツ表示ではありません。",
		variantNotes: {
			"One-level": "1-levelで実スーツを示すオーバーコール。",
			"Two-level": "2-levelで実スーツを示すオーバーコール。",
		},
	},
	"A-CD-02": {
		when: "相手のOpening後、未ビッドの2スーツを一度に示したいとき。",
		meaning: "NTの形を示さず、合意した2つの未ビッドスーツを示します。",
		continuation:
			"パートナーは示された2スーツのどちらを選ぶか、強く続けるかを判断します。",
		check:
			"2スーツは少なくとも5枚＋4枚。未パスハンドでは2NT以上で使います。どの2スーツを示すかは合意を確認します。",
		variantNotes: {
			Minors: "未ビッドの両マイナーを示す方式。",
			"Two lowest unbid": "未ビッドスーツのうち低い2つを示す方式。",
		},
	},
	"A-CD-03": {
		when: "相手のスーツOpening後、他スーツへの対応力を示したいとき。",
		meaning: "Doubleはペナルティ狙いではなく、他スーツへのTakeoutを求めます。",
		continuation:
			"パートナーは手の形と強さに応じ、適した未ビッドスーツなどを選びます。",
		check:
			"相手スーツの短さ、他スーツへの対応力、必要強度を確認します。直接のDoubleとBalancingでは条件を分けます。",
		variantNotes: {
			Direct: "相手のOpening直後に行うTakeout Double。",
			Balancing: "相手に低いContractを買わせないためのBalancing位置のDouble。",
		},
	},
	"A-CD-04": {
		when: "相手のスラムコントラクトに対し、ディフェンス側がDoubleするとき。",
		meaning: "通常とは異なるOpening Leadをパートナーへ要求します。",
		continuation:
			"リードするパートナーは、通常のリード候補を外して合意した手掛かりを探します。",
		check:
			"どのリードを除外し、何を求めるかを事前に合意します。通常のペナルティDoubleと混同しません。",
		variantNotes: {
			Lightner: "スラムに対し、普段と異なるリードを要求するDouble。",
		},
	},
	"A-CD-05": {
		when: "パートナーのOpeningに相手がOvercallし、自分がDoubleする位置。",
		meaning: "Penaltyではなく、未ビッドスーツを示します。",
		continuation:
			"オープナーは示されたスーツへの適合と自分の強さに応じて再Bidします。",
		check:
			"どのスーツを何枚保証するか、使える最高レベルと最低強度をMy Systemで決めます。",
		variantNotes: {
			"Negative double":
				"味方Opening・相手Overcallの後、未ビッドスーツを示すDouble。",
		},
	},
	"A-CD-06": {
		when: "味方の低いContractがペナルティDoubleされ、別のContractへ逃げたいとき。",
		meaning: "Redoubleは得点狙いではなく、逃げるスーツを探す要求です。",
		continuation:
			"パートナーは合意した優先順に従い、より安全なスーツを示します。",
		check:
			"逃げ先の候補と優先順をMy Systemで合意します。得点狙いのRedoubleとの区別が必要です。",
		variantNotes: {
			"SOS redouble": "ペナルティDoubleからの脱出を求めるRedouble。",
		},
	},
	"A-CD-07": {
		when: "相手が示したスーツを自分がCue Bidし、強いTakeoutを伝えるとき。",
		meaning: "そのスーツの実枚数ではなく、ゲームフォース以上を示します。",
		continuation:
			"パートナーはGame未満で止まらない前提で、自分の形を自然に示します。",
		check:
			"相手スーツをBidしただけで全て同じ意味にはなりません。支持＋Invitation以上のCue BidとはAuctionで区別します。",
		variantNotes: {
			"Game force cue bid": "相手スーツのCue BidでGame Force以上を示す。",
		},
	},
	"A-CD-08": {
		when: "パートナーがOvercallした後に、相手スーツをCue Bidするとき。",
		meaning: "パートナーのスーツへの支持とInvitation以上の強さを示します。",
		continuation:
			"Overcallerは最低か余力があるかを示し、Gameへの進行を判断します。",
		check:
			"支持枚数と最低強度をMy Systemで決めます。Game Force Cue Bidとは示す強さが異なります。",
		variantNotes: {
			"Limit raise or better":
				"支持＋Invitation以上を相手スーツのCue Bidで示す。",
		},
	},
	"A-CA-01": {
		when: "本人がディフェンス側として最初のTrickへOpening Leadするとき。",
		meaning:
			"選んだカードの高さで、スーツの枚数やHonorの並びを合意に沿って示します。",
		continuation:
			"パートナーはLead方式を踏まえて残りのカード配置を推測します。",
		check:
			"Fourth highest、Top of Nothing、MUDなどの優先順と、AKからA／Kのどちらを出すかをMy Systemで定めます。",
		variantNotes: {
			"Fourth highest": "長いスーツから4番目に高いカードをLead。",
			"Top of Nothing": "小さいカード3枚以上から、その最上位をLead。",
			MUD: "小さいカード3枚以上から2番目をLead。続けて上、下の順。",
			"Honor sequence": "連続するHonorの最上位からLead（例：KQからK）。",
			"A from AK": "AKの組合せからAをLead。",
			"K from AK": "AKの組合せからKをLead。",
		},
	},
	"A-CA-02": {
		when: "ディフェンス中、本人がパートナーに情報を伝えるカードをPlayするとき。",
		meaning:
			"状況に応じ、好悪（Attitude）、枚数（Count）、希望スーツ（Suit Preference）を示します。",
		continuation:
			"パートナーはTrickの流れと優先順位を見て、どの種類のSignalかを判断します。",
		check:
			"どのSignalを優先するかをMy Systemで決めます。意図が一意に読めないカードは自動評価でも判定不能です。",
		variantNotes: {
			"Normal attitude":
				"高いカードはリードされたスーツに関心あり、低いカードは関心なし。",
			Count: "高いカードはスーツの枚数が偶数、低いカードは奇数を示す。",
			"Suit preference":
				"高いカードは高ランク、低いカードは低ランクの別スーツへの関心を示す。",
		},
	},
};
