import { describe, expect, it } from "vitest";

import { evaluateBoard } from "../evaluator";
import { JCBL_LIST_A_2026_05_01, JCBL_RULESET_VERSION } from "../ruleset";
import {
	type BridgeDeal,
	defaultSystemSettings,
	type SystemSnapshot,
} from "../types";

const deal: BridgeDeal = {
	boardNumber: 1,
	dealer: "N",
	hands: {
		N: "AKQJ.AT98.32.432",
		E: "9876.7654.AK.QJ2",
		S: "T543.KQJ2.QJ.T98",
		W: "2.3.T987654.AK76",
	},
	vulnerability: "None",
};
const system: SystemSnapshot = {
	adoptedOfficialItemIds: JCBL_LIST_A_2026_05_01.map(
		(rule) => rule.officialItemId
	),
	name: "Test System",
	rulesetVersion: JCBL_RULESET_VERSION,
	selectedVariants: Object.fromEntries(
		JCBL_LIST_A_2026_05_01.map((rule) => [
			rule.officialItemId,
			[...rule.variants],
		])
	),
	settings: defaultSystemSettings,
};

describe("rule evaluator", () => {
	it("always records one evaluation for each of the 22 official items", () => {
		const results = evaluateBoard({
			auction: [],
			deal,
			heroSeat: "N",
			playComplete: false,
			system,
		});
		expect(results).toHaveLength(22);
		expect(new Set(results.map((result) => result.ruleVersionId)).size).toBe(
			22
		);
	});

	it("emits all automatic verdict families without converting uncertainty into deviation", () => {
		const complied = evaluateBoard({
			auction: [{ call: "2S", index: 0, seat: "N" }],
			deal: { ...deal, hands: { ...deal.hands, N: "AKQJT9.432.432.2" } },
			heroSeat: "N",
			playComplete: true,
			system,
		});
		expect(
			complied.find((item) => item.ruleVersionId.startsWith("A-OB-01"))
				?.automaticVerdict
		).toBe("COMPLIED");

		const wrong = evaluateBoard({
			auction: [{ call: "2S", index: 0, seat: "N" }],
			deal: { ...deal, hands: { ...deal.hands, N: "98765.432.432.2" } },
			heroSeat: "N",
			playComplete: true,
			system,
		});
		expect(
			wrong.find((item) => item.ruleVersionId.startsWith("A-OB-01"))
				?.automaticVerdict
		).toBe("DEVIATED_WRONG_APPLICATION");

		const missed = evaluateBoard({
			auction: [
				{ call: "1NT", index: 0, seat: "N" },
				{ call: "PASS", index: 1, seat: "E" },
				{ call: "PASS", index: 2, seat: "S" },
			],
			deal: { ...deal, hands: { ...deal.hands, S: "AQ32.KJ32.QJ2.32" } },
			heroSeat: "S",
			playComplete: true,
			system,
		});
		expect(
			missed.find((item) => item.ruleVersionId.startsWith("A-RR-02"))
				?.automaticVerdict
		).toBe("DEVIATED_MISSED_OPPORTUNITY");

		const indeterminate = evaluateBoard({
			auction: [],
			deal,
			playComplete: false,
			system,
		});
		expect(
			indeterminate.every((item) => item.automaticVerdict === "INDETERMINATE")
		).toBe(true);

		const notApplicable = evaluateBoard({
			auction: [],
			deal,
			heroSeat: "N",
			playComplete: true,
			system: { ...system, adoptedOfficialItemIds: [] },
		});
		expect(
			notApplicable.every((item) => item.automaticVerdict === "NOT_APPLICABLE")
		).toBe(true);
	});
});
