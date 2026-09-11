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
});
