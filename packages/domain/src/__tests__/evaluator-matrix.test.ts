import { describe, expect, it } from "vitest";

import {
	type EvaluationInput,
	evaluateOfficialItem,
	RULE_EVALUATORS,
} from "../evaluator";
import {
	JCBL_LIST_A_2026_05_01,
	JCBL_RULESET_VERSION,
	type OfficialItemId,
} from "../ruleset";
import {
	defaultSystemSettings,
	type PlayAction,
	type Seat,
	type SystemSnapshot,
} from "../types";

const allRuleIds = JCBL_LIST_A_2026_05_01.map((rule) => rule.officialItemId);
const system: SystemSnapshot = {
	adoptedOfficialItemIds: allRuleIds,
	name: "Evaluator matrix",
	rulesetVersion: JCBL_RULESET_VERSION,
	selectedVariants: Object.fromEntries(
		JCBL_LIST_A_2026_05_01.map((rule) => [
			rule.officialItemId,
			[...rule.variants],
		])
	),
	settings: defaultSystemSettings,
};

interface ScenarioOptions {
	calls?: [Seat, string][];
	heroHand: string;
	heroSeat?: Seat;
	partnerHand?: string;
	play?: PlayAction[];
	playComplete?: boolean;
	systemOverride?: Partial<SystemSnapshot>;
}

function scenario({
	calls = [],
	heroHand,
	heroSeat = "N",
	partnerHand,
	play = [],
	playComplete = true,
	systemOverride,
}: ScenarioOptions): EvaluationInput {
	const partnerBySeat: Record<Seat, Seat> = {
		E: "W",
		N: "S",
		S: "N",
		W: "E",
	};
	const partnerSeat = partnerBySeat[heroSeat];
	const hands = {
		N: "9876.765.432.432",
		E: "T543.T98.765.765",
		S: "AKQJ.AKQJ.AK.432",
		W: "32.432.QJT98.AKQ",
	};
	hands[heroSeat] = heroHand;
	if (partnerHand) {
		hands[partnerSeat] = partnerHand;
	}
	return {
		auction: calls.map(([seat, call], index) => ({ call, index, seat })),
		deal: {
			boardNumber: 1,
			dealer: calls[0]?.[0] ?? heroSeat,
			hands,
			vulnerability: "None",
		},
		heroSeat,
		play,
		playComplete,
		system: { ...system, ...systemOverride },
	};
}

const weak = "9876.765.432.432";
const invitational = "KQ32.AJ32.432.32";
const strong = "AKQJ.AKQJ.AK.432";
const weakTwoSpades = "KQJT98.432.32.32";
const overcallSpades = "KQJT9.A32.432.32";
const unusualMinors = "32.32.KQJ98.AQJT";
const takeoutHearts = "KQJ9.32.AQJ9.KQJ";
const fitShowing = "KQJT98.A32.32.32";
const supportSpades = "KQ3.AJ32.432.32";
const cueStrong = "AKQJ.AKQJ.432.32";

type ThreeVerdictFixtures = Record<
	OfficialItemId,
	{
		complied: EvaluationInput;
		missed: EvaluationInput;
		wrong: EvaluationInput;
	}
>;

const fixtures: ThreeVerdictFixtures = {
	"A-OB-01": {
		complied: scenario({ calls: [["N", "2S"]], heroHand: weakTwoSpades }),
		missed: scenario({ calls: [["N", "PASS"]], heroHand: weakTwoSpades }),
		wrong: scenario({ calls: [["N", "2S"]], heroHand: weak }),
	},
	"A-OB-02": {
		complied: scenario({ calls: [["N", "2C"]], heroHand: strong }),
		missed: scenario({ calls: [["N", "PASS"]], heroHand: strong }),
		wrong: scenario({ calls: [["N", "2C"]], heroHand: weak }),
	},
	"A-RR-01": {
		complied: scenario({
			calls: [
				["S", "1C"],
				["W", "PASS"],
				["N", "1H"],
			],
			heroHand: invitational,
		}),
		missed: scenario({
			calls: [
				["S", "1C"],
				["W", "PASS"],
				["N", "PASS"],
			],
			heroHand: invitational,
		}),
		wrong: scenario({
			calls: [
				["S", "1C"],
				["W", "PASS"],
				["N", "1H"],
			],
			heroHand: weak,
		}),
	},
	"A-RR-02": {
		complied: scenario({
			calls: [
				["S", "1NT"],
				["W", "PASS"],
				["N", "2C"],
			],
			heroHand: invitational,
		}),
		missed: scenario({
			calls: [
				["S", "1NT"],
				["W", "PASS"],
				["N", "PASS"],
			],
			heroHand: invitational,
		}),
		wrong: scenario({
			calls: [
				["S", "1NT"],
				["W", "PASS"],
				["N", "2C"],
			],
			heroHand: "KQ3.AJ3.432.4321",
		}),
	},
	"A-RR-03": {
		complied: scenario({
			calls: [
				["S", "2C"],
				["W", "PASS"],
				["N", "2D"],
			],
			heroHand: weak,
		}),
		missed: scenario({
			calls: [
				["S", "2C"],
				["W", "PASS"],
				["N", "PASS"],
			],
			heroHand: weak,
		}),
		wrong: scenario({
			calls: [
				["S", "2C"],
				["W", "PASS"],
				["N", "2D"],
			],
			heroHand: strong,
		}),
	},
	"A-RR-04": {
		complied: scenario({
			calls: [
				["S", "2H"],
				["W", "PASS"],
				["N", "2NT"],
			],
			heroHand: weak,
			partnerHand: strong,
		}),
		missed: scenario({
			calls: [
				["S", "2H"],
				["W", "PASS"],
				["N", "PASS"],
			],
			heroHand: weak,
			partnerHand: strong,
		}),
		wrong: scenario({
			calls: [
				["S", "2H"],
				["W", "PASS"],
				["N", "2NT"],
			],
			heroHand: strong,
			partnerHand: strong,
		}),
	},
	"A-RR-05": {
		complied: scenario({
			calls: [
				["S", "2H"],
				["W", "PASS"],
				["N", "2NT"],
			],
			heroHand: invitational,
			partnerHand: "32.KQJT98.432.32",
		}),
		missed: scenario({
			calls: [
				["S", "2H"],
				["W", "PASS"],
				["N", "PASS"],
			],
			heroHand: invitational,
			partnerHand: "32.KQJT98.432.32",
		}),
		wrong: scenario({
			calls: [
				["S", "2H"],
				["W", "PASS"],
				["N", "2NT"],
			],
			heroHand: weak,
			partnerHand: "32.KQJT98.432.32",
		}),
	},
	"A-RR-06": {
		complied: scenario({
			calls: [
				["S", "1H"],
				["W", "PASS"],
				["N", "4NT"],
			],
			heroHand: "AKQJ.AKQ.432.32",
		}),
		missed: scenario({
			calls: [
				["S", "1H"],
				["W", "PASS"],
				["N", "4H"],
			],
			heroHand: "AKQJ.AKQ.432.32",
		}),
		wrong: scenario({
			calls: [
				["S", "1H"],
				["W", "PASS"],
				["N", "4NT"],
			],
			heroHand: weak,
		}),
	},
	"A-RR-07": {
		complied: scenario({
			calls: [
				["S", "1NT"],
				["W", "PASS"],
				["N", "4C"],
			],
			heroHand: cueStrong,
		}),
		missed: scenario({
			calls: [
				["S", "1NT"],
				["W", "PASS"],
				["N", "3NT"],
			],
			heroHand: cueStrong,
		}),
		wrong: scenario({
			calls: [
				["S", "1NT"],
				["W", "PASS"],
				["N", "4C"],
			],
			heroHand: weak,
		}),
	},
	"A-RR-08": {
		complied: scenario({
			calls: [
				["S", "1H"],
				["W", "PASS"],
				["N", "5NT"],
			],
			heroHand: "AKQJ.AKQ.432.32",
		}),
		missed: scenario({
			calls: [
				["S", "1H"],
				["W", "PASS"],
				["N", "4H"],
			],
			heroHand: "AKQJ.AKQ.432.32",
		}),
		wrong: scenario({
			calls: [
				["S", "1H"],
				["W", "PASS"],
				["N", "5NT"],
			],
			heroHand: weak,
		}),
	},
	"A-RR-09": {
		complied: scenario({ calls: [["N", "1NT"]], heroHand: "AQ32.KJ3.QJ2.K32" }),
		missed: scenario({ calls: [["N", "PASS"]], heroHand: "AQ32.KJ3.QJ2.K32" }),
		wrong: scenario({ calls: [["N", "1NT"]], heroHand: weak }),
	},
	"A-RR-10": {
		complied: scenario({
			calls: [
				["S", "1H"],
				["W", "PASS"],
				["N", "2S"],
			],
			heroHand: fitShowing,
		}),
		missed: scenario({
			calls: [
				["S", "1H"],
				["W", "PASS"],
				["N", "PASS"],
			],
			heroHand: fitShowing,
		}),
		wrong: scenario({
			calls: [
				["S", "1H"],
				["W", "PASS"],
				["N", "2S"],
			],
			heroHand: "KQJT9.2.432.4321",
		}),
	},
	"A-CD-01": {
		complied: scenario({
			calls: [
				["E", "1C"],
				["S", "PASS"],
				["N", "1S"],
			],
			heroHand: overcallSpades,
		}),
		missed: scenario({
			calls: [
				["E", "1C"],
				["S", "PASS"],
				["N", "PASS"],
			],
			heroHand: overcallSpades,
		}),
		wrong: scenario({
			calls: [
				["E", "1C"],
				["S", "PASS"],
				["N", "1S"],
			],
			heroHand: weak,
		}),
	},
	"A-CD-02": {
		complied: scenario({
			calls: [
				["E", "1S"],
				["S", "PASS"],
				["N", "2NT"],
			],
			heroHand: unusualMinors,
		}),
		missed: scenario({
			calls: [
				["E", "1S"],
				["S", "PASS"],
				["N", "PASS"],
			],
			heroHand: unusualMinors,
		}),
		wrong: scenario({
			calls: [
				["E", "1S"],
				["S", "PASS"],
				["N", "2NT"],
			],
			heroHand: weak,
		}),
	},
	"A-CD-03": {
		complied: scenario({
			calls: [
				["E", "1H"],
				["S", "PASS"],
				["N", "X"],
			],
			heroHand: takeoutHearts,
		}),
		missed: scenario({
			calls: [
				["E", "1H"],
				["S", "PASS"],
				["N", "PASS"],
			],
			heroHand: takeoutHearts,
		}),
		wrong: scenario({
			calls: [
				["E", "1H"],
				["S", "PASS"],
				["N", "X"],
			],
			heroHand: weak,
		}),
	},
	"A-CD-04": {
		complied: scenario({
			calls: [
				["E", "6S"],
				["N", "X"],
			],
			heroHand: weak,
		}),
		missed: scenario({
			calls: [
				["E", "6S"],
				["N", "PASS"],
			],
			heroHand: "AKQJ.432.AKQJT9.",
		}),
		wrong: scenario({
			calls: [
				["E", "4S"],
				["N", "X"],
			],
			heroHand: weak,
		}),
	},
	"A-CD-05": {
		complied: scenario({
			calls: [
				["S", "1D"],
				["W", "1S"],
				["N", "X"],
			],
			heroHand: invitational,
		}),
		missed: scenario({
			calls: [
				["S", "1D"],
				["W", "1S"],
				["N", "PASS"],
			],
			heroHand: invitational,
		}),
		wrong: scenario({
			calls: [
				["S", "1D"],
				["W", "1S"],
				["N", "X"],
			],
			heroHand: weak,
		}),
	},
	"A-CD-06": {
		complied: scenario({
			calls: [
				["S", "1NT"],
				["W", "X"],
				["N", "XX"],
			],
			heroHand: "9876.7654.32.432",
		}),
		missed: scenario({
			calls: [
				["S", "1NT"],
				["W", "X"],
				["N", "PASS"],
			],
			heroHand: "9876.7654.32.432",
		}),
		wrong: scenario({
			calls: [
				["S", "1NT"],
				["W", "X"],
				["N", "XX"],
			],
			heroHand: strong,
		}),
	},
	"A-CD-07": {
		complied: scenario({
			calls: [
				["E", "1S"],
				["S", "PASS"],
				["N", "2S"],
			],
			heroHand: cueStrong,
		}),
		missed: scenario({
			calls: [
				["E", "1S"],
				["S", "PASS"],
				["N", "PASS"],
			],
			heroHand: cueStrong,
		}),
		wrong: scenario({
			calls: [
				["E", "1S"],
				["S", "PASS"],
				["N", "2S"],
			],
			heroHand: weak,
		}),
	},
	"A-CD-08": {
		complied: scenario({
			calls: [
				["E", "1H"],
				["S", "1S"],
				["W", "PASS"],
				["N", "2H"],
			],
			heroHand: supportSpades,
		}),
		missed: scenario({
			calls: [
				["E", "1H"],
				["S", "1S"],
				["W", "PASS"],
				["N", "PASS"],
			],
			heroHand: supportSpades,
		}),
		wrong: scenario({
			calls: [
				["E", "1H"],
				["S", "1S"],
				["W", "PASS"],
				["N", "2H"],
			],
			heroHand: weak,
		}),
	},
	"A-CA-01": {
		complied: scenario({
			heroHand: "AKQJ.432.432.32",
			play: [{ card: "SA", index: 0, seat: "N", trickNumber: 1 }],
		}),
		missed: scenario({
			heroHand: "AKQJ.432.432.32",
			play: [{ card: "SK", index: 0, seat: "N", trickNumber: 1 }],
		}),
		wrong: scenario({
			heroHand: "98.AKQJ.432.4321",
			play: [{ card: "S9", index: 0, seat: "N", trickNumber: 1 }],
		}),
	},
	"A-CA-02": {
		complied: scenario({
			heroHand: "98.AKQJ.432.4321",
			play: [
				{ card: "S2", index: 0, seat: "E", trickNumber: 1 },
				{ card: "S9", index: 1, seat: "N", trickNumber: 1 },
				{ card: "S3", index: 4, seat: "W", trickNumber: 2 },
				{ card: "S8", index: 5, seat: "N", trickNumber: 2 },
			],
		}),
		missed: scenario({
			heroHand: "98.AKQJ.432.4321",
			play: [
				{ card: "S2", index: 0, seat: "E", trickNumber: 1 },
				{ card: "S9", index: 1, seat: "N", trickNumber: 1 },
			],
		}),
		wrong: scenario({
			heroHand: "98.AKQJ.432.4321",
			play: [
				{ card: "S2", index: 0, seat: "E", trickNumber: 1 },
				{ card: "S8", index: 1, seat: "N", trickNumber: 1 },
				{ card: "S3", index: 4, seat: "W", trickNumber: 2 },
				{ card: "S9", index: 5, seat: "N", trickNumber: 2 },
			],
		}),
	},
};

describe("JCBL List A evaluator fixture matrix", () => {
	it("registers one concrete evaluator for every manifest item", () => {
		expect(Object.keys(RULE_EVALUATORS).sort()).toEqual([...allRuleIds].sort());
		expect(Object.keys(fixtures).sort()).toEqual([...allRuleIds].sort());
	});

	for (const rule of JCBL_LIST_A_2026_05_01) {
		const cases = fixtures[rule.officialItemId];
		if (!cases) {
			throw new Error(`Fixture matrix missing ${rule.officialItemId}`);
		}
		it.each([
			["complied", "COMPLIED"],
			["wrong", "DEVIATED_WRONG_APPLICATION"],
			["missed", "DEVIATED_MISSED_OPPORTUNITY"],
		] as const)(`${rule.officialItemId} emits %s`, (name, verdict) => {
			expect(
				evaluateOfficialItem(rule.officialItemId, cases[name]).automaticVerdict
			).toBe(verdict);
		});

		it(`${rule.officialItemId} emits INDETERMINATE for missing evidence`, () => {
			const input = scenario({ heroHand: weak });
			if (rule.category === "CARDING") {
				input.play = undefined;
			} else {
				input.auction = undefined;
			}
			expect(
				evaluateOfficialItem(rule.officialItemId, input).automaticVerdict
			).toBe("INDETERMINATE");
		});

		it(`${rule.officialItemId} emits NOT_APPLICABLE when not adopted`, () => {
			const input = scenario({
				heroHand: weak,
				systemOverride: {
					adoptedOfficialItemIds: allRuleIds.filter(
						(id) => id !== rule.officialItemId
					),
				},
			});
			expect(
				evaluateOfficialItem(rule.officialItemId, input).automaticVerdict
			).toBe("NOT_APPLICABLE");
		});
	}
});
