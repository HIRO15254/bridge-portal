import { describe, expect, it } from "vitest";

import { type EvaluationInput, evaluateOfficialItem } from "../evaluator";
import { JCBL_LIST_A_2026_05_01, JCBL_RULESET_VERSION } from "../ruleset";
import {
	defaultSystemSettings,
	type Seat,
	type SystemSnapshot,
} from "../types";

const allIds = JCBL_LIST_A_2026_05_01.map((rule) => rule.officialItemId);

function input(
	hand: string,
	calls: [Seat, string][],
	systemOverrides: Partial<SystemSnapshot> = {}
): EvaluationInput {
	return {
		auction: calls.map(([seat, call], index) => ({ call, index, seat })),
		deal: {
			boardNumber: 1,
			dealer: calls[0]?.[0] ?? "N",
			hands: {
				E: "9876.7654.AK.QJ5",
				N: hand,
				S: "T543.KQJ2.QJ.T98",
				W: "2.3.T987654.AK76",
			},
			vulnerability: "None",
		},
		heroSeat: "N",
		playComplete: false,
		system: {
			adoptedOfficialItemIds: allIds,
			name: "Boundary",
			rulesetVersion: JCBL_RULESET_VERSION,
			selectedVariants: Object.fromEntries(
				JCBL_LIST_A_2026_05_01.map((rule) => [
					rule.officialItemId,
					[...rule.variants],
				])
			),
			settings: defaultSystemSettings,
			...systemOverrides,
		},
	};
}

describe("priority evaluator boundaries", () => {
	it("accepts Rule of 10 exactly and rejects nine", () => {
		const settings = {
			...defaultSystemSettings,
			opening: { ...defaultSystemSettings.opening, weakTwoMinHcp: 0 },
		};
		expect(
			evaluateOfficialItem(
				"A-OB-01",
				input("KJ9876.432.32.32", [["N", "2S"]], { settings })
			).automaticVerdict
		).toBe("COMPLIED");
		expect(
			evaluateOfficialItem(
				"A-OB-01",
				input("K98765.432.32.32", [["N", "2S"]], { settings })
			).automaticVerdict
		).toBe("DEVIATED_WRONG_APPLICATION");
	});

	it("enforces the 20 HCP boundary for that Strong 2C definition", () => {
		const selectedVariants = { "A-OB-02": ["20+ HCP"] };
		expect(
			evaluateOfficialItem(
				"A-OB-02",
				input("AKQJ.AKQJ.32.432", [["N", "2C"]], { selectedVariants })
			).automaticVerdict
		).toBe("COMPLIED");
		expect(
			evaluateOfficialItem(
				"A-OB-02",
				input("AKQJ.AKQ2.32.432", [["N", "2C"]], { selectedVariants })
			).automaticVerdict
		).toBe("DEVIATED_WRONG_APPLICATION");
	});

	it.each([
		{
			hand: "AKQJT9.AK32.2.32",
			variant: "17+ HCP loser definition",
		},
		{
			hand: "AQJT987.A432.K2.",
			variant: "14+ HCP and 5+ controls",
		},
	])("evaluates the $variant Strong 2C boundary", ({ hand, variant }) => {
		const verdict = evaluateOfficialItem(
			"A-OB-02",
			input(hand, [["N", "2C"]], {
				selectedVariants: { "A-OB-02": [variant] },
			})
		);

		expect(verdict.automaticVerdict).toBe("COMPLIED");
	});

	it("accepts exactly 5-4 for Unusual NT", () => {
		expect(
			evaluateOfficialItem(
				"A-CD-02",
				input("32.32.KQJ9.AQJT9", [
					["E", "1S"],
					["S", "PASS"],
					["N", "2NT"],
				])
			).automaticVerdict
		).toBe("COMPLIED");
	});

	it("routes Unusual NT to the two-lowest-unbid variant over a minor", () => {
		const calls: [Seat, string][] = [
			["E", "1C"],
			["S", "PASS"],
			["N", "2NT"],
		];
		const hand = "32.KQJ9.AQJT9.32";
		expect(
			evaluateOfficialItem(
				"A-CD-02",
				input(hand, calls, {
					selectedVariants: { "A-CD-02": ["Two lowest unbid"] },
				})
			).automaticVerdict
		).toBe("COMPLIED");
		expect(
			evaluateOfficialItem(
				"A-CD-02",
				input(hand, calls, {
					selectedVariants: { "A-CD-02": ["Minors"] },
				})
			).automaticVerdict
		).toBe("NOT_APPLICABLE");
	});

	it("does not evaluate an unadopted overcall level", () => {
		const calls: [Seat, string][] = [
			["E", "1S"],
			["S", "PASS"],
			["N", "2H"],
		];
		const hand = "32.KQJT9.A32.432";
		expect(
			evaluateOfficialItem(
				"A-CD-01",
				input(hand, calls, {
					selectedVariants: { "A-CD-01": ["Two-level"] },
				})
			).automaticVerdict
		).toBe("COMPLIED");
		expect(
			evaluateOfficialItem(
				"A-CD-01",
				input(hand, calls, {
					selectedVariants: { "A-CD-01": ["One-level"] },
				})
			).automaticVerdict
		).toBe("NOT_APPLICABLE");
	});

	it("evaluates the responder's natural rebid with its typed agreement", () => {
		const auction: [Seat, string][] = [
			["S", "1C"],
			["W", "PASS"],
			["N", "1H"],
			["E", "PASS"],
			["S", "1NT"],
			["W", "PASS"],
			["N", "2S"],
		];
		const complied = evaluateOfficialItem(
			"A-RR-01",
			input("KQ32.AJ32.432.32", auction)
		);
		const wrong = evaluateOfficialItem(
			"A-RR-01",
			input("KQ3.AJ432.432.32", auction)
		);

		expect(complied.automaticVerdict).toBe("COMPLIED");
		expect(complied.reasonCode).toBe("NATURAL_RESPONDER_REBID_COMPLIED");
		expect(complied.facts).toMatchObject({
			minimumLength: 4,
			role: "RESPONDER_REBID",
			suitRole: "NEW_SUIT",
		});
		expect(wrong.automaticVerdict).toBe("DEVIATED_WRONG_APPLICATION");
	});

	it("does not guess whether a responder's pass over a rebid is forcing", () => {
		const verdict = evaluateOfficialItem(
			"A-RR-01",
			input("KQ32.AJ32.432.32", [
				["S", "1C"],
				["W", "PASS"],
				["N", "1H"],
				["E", "PASS"],
				["S", "1NT"],
				["W", "PASS"],
				["N", "PASS"],
			])
		);

		expect(verdict.automaticVerdict).toBe("INDETERMINATE");
		expect(verdict.reasonCode).toBe(
			"RESPONDER_REBID_FORCING_STATUS_NOT_OBJECTIVE"
		);
	});

	it("requires 2NT or higher before the hero has passed", () => {
		const hand = "32.32.KQJ9.AQJT9";
		expect(
			evaluateOfficialItem(
				"A-CD-02",
				input(hand, [
					["E", "1S"],
					["S", "PASS"],
					["N", "1NT"],
				])
			).automaticVerdict
		).toBe("DEVIATED_WRONG_APPLICATION");
		expect(
			evaluateOfficialItem(
				"A-CD-02",
				input(hand, [
					["N", "PASS"],
					["E", "1S"],
					["S", "PASS"],
					["W", "PASS"],
					["N", "1NT"],
				])
			).automaticVerdict
		).toBe("COMPLIED");
	});

	it.each([
		{
			calls: [
				["S", "4NT"],
				["W", "5C"],
				["N", "X"],
			] satisfies [Seat, string][],
			hand: "KQ32.KJ32.Q32.32",
			method: "DOPI",
		},
		{
			calls: [
				["S", "4NT"],
				["W", "5C"],
				["N", "X"],
			] satisfies [Seat, string][],
			hand: "AQ32.AJ32.432.32",
			method: "DEPO",
		},
		{
			calls: [
				["S", "4NT"],
				["W", "X"],
				["N", "XX"],
			] satisfies [Seat, string][],
			hand: "KQ32.KJ32.Q32.32",
			method: "ROPI",
		},
	])("evaluates the $method Blackwood interference method", ({
		calls,
		hand,
		method,
	}) => {
		const verdict = evaluateOfficialItem(
			"A-RR-06",
			input(hand, calls, {
				selectedVariants: { "A-RR-06": ["Blackwood", method] },
			})
		);

		expect(verdict.automaticVerdict).toBe("COMPLIED");
		expect(verdict.reasonCode).toBe("BLACKWOOD_RESPONSE_COMPLIED");
	});

	it("uses bid steps for two aces in DOPI", () => {
		const verdict = evaluateOfficialItem(
			"A-RR-06",
			input(
				"AQ32.AJ32.432.32",
				[
					["S", "4NT"],
					["W", "5C"],
					["N", "5D"],
				],
				{ selectedVariants: { "A-RR-06": ["Blackwood", "DOPI"] } }
			)
		);

		expect(verdict.automaticVerdict).toBe("COMPLIED");
		expect(verdict.facts).toMatchObject({ expected: "5D" });
	});

	it("evaluates the 5NT Blackwood king-ask response after the ace ask", () => {
		const verdict = evaluateOfficialItem(
			"A-RR-06",
			input(
				"AQ32.AK32.432.32",
				[
					["S", "1H"],
					["W", "PASS"],
					["N", "2H"],
					["E", "PASS"],
					["S", "4NT"],
					["W", "PASS"],
					["N", "5H"],
					["E", "PASS"],
					["S", "5NT"],
					["W", "PASS"],
					["N", "6D"],
				],
				{
					selectedVariants: {
						"A-RR-06": ["Blackwood", "5NT king ask", "DOPI"],
					},
				}
			)
		);

		expect(verdict.automaticVerdict).toBe("COMPLIED");
		expect(verdict.facts).toMatchObject({ actual: "6D", expected: "6D" });
	});

	it("evaluates a Feature-ask response from the Weak Two opener", () => {
		const verdict = evaluateOfficialItem(
			"A-RR-05",
			input(
				"K432.QJT987.32.2",
				[
					["N", "2H"],
					["E", "PASS"],
					["S", "2NT"],
					["W", "PASS"],
					["N", "3S"],
				],
				{ selectedVariants: { "A-RR-05": ["Feature ask"] } }
			)
		);

		expect(verdict.automaticVerdict).toBe("COMPLIED");
		expect(verdict.facts).toMatchObject({
			expected: "3S",
			feature: "S",
			inquiryVariant: "Feature ask",
		});
	});

	it("evaluates the configured Stayman response with both four-card majors", () => {
		const calls: [Seat, string][] = [
			["N", "1NT"],
			["E", "PASS"],
			["S", "2C"],
			["W", "PASS"],
			["N", "2H"],
		];
		const complied = evaluateOfficialItem(
			"A-RR-02",
			input("AQ32.KJ32.Q32.32", calls)
		);
		const wrong = evaluateOfficialItem(
			"A-RR-02",
			input("AQ32.KJ32.Q32.32", [...calls.slice(0, -1), ["N", "2S"]])
		);

		expect(complied.automaticVerdict).toBe("COMPLIED");
		expect(complied.facts).toMatchObject({ expected: "2H" });
		expect(wrong.automaticVerdict).toBe("DEVIATED_WRONG_APPLICATION");
	});

	it("evaluates an Ogust response from the Weak Two opener", () => {
		const systemOverrides = {
			selectedVariants: { "A-RR-05": ["Ogust-style ask"] },
		};
		const calls: [Seat, string][] = [
			["N", "2H"],
			["E", "PASS"],
			["S", "2NT"],
			["W", "PASS"],
			["N", "3S"],
		];
		const complied = evaluateOfficialItem(
			"A-RR-05",
			input("32.KQJT98.A32.32", calls, systemOverrides)
		);
		const wrong = evaluateOfficialItem(
			"A-RR-05",
			input(
				"32.KQJT98.A32.32",
				[...calls.slice(0, -1), ["N", "3C"]],
				systemOverrides
			)
		);

		expect(complied.automaticVerdict).toBe("COMPLIED");
		expect(complied.facts).toMatchObject({
			expected: "3S",
			goodSuit: true,
			inquiryVariant: "Ogust-style ask",
			maximum: true,
		});
		expect(wrong.automaticVerdict).toBe("DEVIATED_WRONG_APPLICATION");
	});

	it("rejects a direct Gerber 5C king ask without the 4C sequence", () => {
		const verdict = evaluateOfficialItem(
			"A-RR-07",
			input("AKQJ.AKQJ.432.32", [
				["S", "1NT"],
				["W", "PASS"],
				["N", "5C"],
			])
		);

		expect(verdict.automaticVerdict).toBe("DEVIATED_WRONG_APPLICATION");
		expect(verdict.reasonCode).toBe("GERBER_KING_ASK_WITHOUT_ACE_SEQUENCE");
	});

	it("evaluates the typed Grand Slam Force trump response", () => {
		const calls: [Seat, string][] = [
			["S", "1H"],
			["W", "PASS"],
			["N", "2H"],
			["E", "PASS"],
			["S", "5NT"],
			["W", "PASS"],
			["N", "7H"],
		];
		const complied = evaluateOfficialItem(
			"A-RR-08",
			input("32.AK432.Q32.432", calls)
		);
		const wrong = evaluateOfficialItem(
			"A-RR-08",
			input("32.AK432.Q32.432", [...calls.slice(0, -1), ["N", "6H"]])
		);

		expect(complied.automaticVerdict).toBe("COMPLIED");
		expect(complied.facts).toMatchObject({
			expected: "7H",
			grandThreshold: 2,
			topHonors: 2,
		});
		expect(wrong.automaticVerdict).toBe("DEVIATED_WRONG_APPLICATION");
	});

	it("evaluates Gerber ace and king response steps", () => {
		const aceResponse = evaluateOfficialItem(
			"A-RR-07",
			input("AQ32.AK32.432.32", [
				["N", "1NT"],
				["E", "PASS"],
				["S", "4C"],
				["W", "PASS"],
				["N", "4S"],
			])
		);
		const kingResponse = evaluateOfficialItem(
			"A-RR-07",
			input("AQ32.AK32.432.32", [
				["N", "1NT"],
				["E", "PASS"],
				["S", "4C"],
				["W", "PASS"],
				["N", "4S"],
				["E", "PASS"],
				["S", "5C"],
				["W", "PASS"],
				["N", "5H"],
			])
		);

		expect(aceResponse.automaticVerdict).toBe("COMPLIED");
		expect(aceResponse.facts).toMatchObject({
			controlsHeld: 2,
			targetRank: "A",
		});
		expect(kingResponse.automaticVerdict).toBe("COMPLIED");
		expect(kingResponse.facts).toMatchObject({
			controlsHeld: 1,
			targetRank: "K",
		});
	});

	it("requires the configured HCP as well as shape for a Fit-showing Jump", () => {
		const calls: [Seat, string][] = [
			["S", "1H"],
			["W", "PASS"],
			["N", "2S"],
		];
		expect(
			evaluateOfficialItem("A-RR-10", input("KQJT98.A32.32.32", calls))
				.automaticVerdict
		).toBe("COMPLIED");
		expect(
			evaluateOfficialItem("A-RR-10", input("KQJT98.K32.32.32", calls))
				.automaticVerdict
		).toBe("DEVIATED_WRONG_APPLICATION");
	});

	it("checks the configured void condition for a Lightner Double", () => {
		const calls: [Seat, string][] = [
			["E", "6S"],
			["N", "X"],
		];
		const noVoidHand = "9876.765.432.432";
		expect(
			evaluateOfficialItem("A-CD-04", input(noVoidHand, calls)).automaticVerdict
		).toBe("DEVIATED_WRONG_APPLICATION");
		const settings = {
			...defaultSystemSettings,
			competitive: {
				...defaultSystemSettings.competitive,
				lightnerRequireVoid: false,
			},
		};
		expect(
			evaluateOfficialItem("A-CD-04", input(noVoidHand, calls, { settings }))
				.automaticVerdict
		).toBe("COMPLIED");
	});

	it("uses the balancing Takeout Double threshold after two passes", () => {
		const calls: [Seat, string][] = [
			["E", "1H"],
			["S", "PASS"],
			["W", "PASS"],
			["N", "X"],
		];
		const selectedVariants = { "A-CD-03": ["Balancing"] };
		const complied = evaluateOfficialItem(
			"A-CD-03",
			input("KQJ9.32.K432.432", calls, { selectedVariants })
		);
		const wrong = evaluateOfficialItem(
			"A-CD-03",
			input("KQJ9.32.Q432.432", calls, { selectedVariants })
		);

		expect(complied.automaticVerdict).toBe("COMPLIED");
		expect(complied.facts).toMatchObject({
			minimumHcp: 9,
			variant: "Balancing",
		});
		expect(wrong.automaticVerdict).toBe("DEVIATED_WRONG_APPLICATION");
	});

	it("does not count a 1NT range agreement when no opening action is relevant", () => {
		const verdict = evaluateOfficialItem(
			"A-RR-09",
			input("AQ32.KJ3.QJ2.K32", [
				["E", "1H"],
				["S", "PASS"],
				["N", "PASS"],
			])
		);

		expect(verdict.automaticVerdict).toBe("NOT_APPLICABLE");
	});

	it.each([
		{
			expected: "S6",
			fromAk: "A",
			fromSmall: "FOURTH_HIGHEST",
			hand: "9876.AKQ.432.432",
		},
		{
			expected: "S9",
			fromAk: "A",
			fromSmall: "TOP_OF_NOTHING",
			hand: "987.AKQ.432.4321",
		},
		{ expected: "S8", fromAk: "A", fromSmall: "MUD", hand: "987.AKQ.432.4321" },
		{
			expected: "SK",
			fromAk: "A",
			fromSmall: "FOURTH_HIGHEST",
			hand: "KQJ9.432.432.32",
		},
		{
			expected: "SA",
			fromAk: "A",
			fromSmall: "FOURTH_HIGHEST",
			hand: "AK32.432.432.32",
		},
		{
			expected: "SK",
			fromAk: "K",
			fromSmall: "FOURTH_HIGHEST",
			hand: "AK32.432.432.32",
		},
	] as const)("evaluates opening-lead variant $expected", ({
		expected,
		fromAk,
		fromSmall,
		hand,
	}) => {
		const settings = {
			...defaultSystemSettings,
			lead: { ...defaultSystemSettings.lead, fromAk, fromSmall },
		};
		const evaluationInput = input(hand, [], { settings });
		evaluationInput.play = [
			{ card: expected, index: 0, seat: "N", trickNumber: 1 },
		];
		evaluationInput.playComplete = true;

		expect(
			evaluateOfficialItem("A-CA-01", evaluationInput).automaticVerdict
		).toBe("COMPLIED");
	});

	it("does not reinterpret an attitude-priority signal as count", () => {
		const evaluationInput = input("98.AKQJ.432.4321", []);
		evaluationInput.play = [
			{ card: "S2", index: 0, seat: "E", trickNumber: 1 },
			{ card: "S9", index: 1, seat: "N", trickNumber: 1 },
			{ card: "S3", index: 4, seat: "W", trickNumber: 2 },
			{ card: "S8", index: 5, seat: "N", trickNumber: 2 },
		];
		evaluationInput.playComplete = true;

		const verdict = evaluateOfficialItem("A-CA-02", evaluationInput);
		expect(verdict.automaticVerdict).toBe("INDETERMINATE");
		expect(verdict.facts).toMatchObject({ signalPriority: "ATTITUDE" });
	});
});
