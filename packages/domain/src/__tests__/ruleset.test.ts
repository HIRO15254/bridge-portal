import { describe, expect, it } from "vitest";
import { JCBL_LIST_A_2026_05_01 } from "../ruleset";

const HTTPS_URL = /^https:/;

describe("JCBL List A 2026 manifest", () => {
	it("contains every official top-level item exactly once", () => {
		expect(JCBL_LIST_A_2026_05_01).toHaveLength(22);
		expect(
			new Set(JCBL_LIST_A_2026_05_01.map((rule) => rule.officialItemId)).size
		).toBe(22);
		expect(
			JCBL_LIST_A_2026_05_01.filter((rule) => rule.category === "OPENING_BIDS")
		).toHaveLength(2);
		expect(
			JCBL_LIST_A_2026_05_01.filter(
				(rule) => rule.category === "RESPONSES_REBIDS"
			)
		).toHaveLength(10);
		expect(
			JCBL_LIST_A_2026_05_01.filter(
				(rule) => rule.category === "COMPETITIVE_DEFENSIVE"
			)
		).toHaveLength(8);
		expect(
			JCBL_LIST_A_2026_05_01.filter((rule) => rule.category === "CARDING")
		).toHaveLength(2);
	});

	it("has source, evaluator, variants and configuration metadata", () => {
		for (const rule of JCBL_LIST_A_2026_05_01) {
			expect(rule.officialUrl).toMatch(HTTPS_URL);
			expect(rule.evaluatorId).not.toBe("");
			expect(rule.variants.length).toBeGreaterThan(0);
			expect(rule.configuration.length).toBeGreaterThan(0);
		}
	});
});
