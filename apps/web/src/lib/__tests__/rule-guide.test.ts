import { JCBL_LIST_A_2026_05_01 } from "@bridge-portal/domain";
import { describe, expect, it } from "vitest";
import { ruleGuides } from "../rule-guide";

describe("rule learning guide", () => {
	it("explains every official item and every listed variant", () => {
		expect(Object.keys(ruleGuides)).toHaveLength(22);
		for (const rule of JCBL_LIST_A_2026_05_01) {
			const guide = ruleGuides[rule.officialItemId];
			for (const field of [
				guide.when,
				guide.meaning,
				guide.continuation,
				guide.check,
			]) {
				expect(field.length).toBeGreaterThan(15);
			}
			expect(Object.keys(guide.variantNotes)).toEqual([...rule.variants]);
			for (const note of Object.values(guide.variantNotes)) {
				expect(note.length).toBeGreaterThan(10);
			}
		}
	});

	it("distinguishes convention eligibility from a pair's response agreement", () => {
		expect(ruleGuides["A-RR-02"].check).toContain("15 HCP");
		expect(ruleGuides["A-RR-02"].when).toContain("NTオープン");
		expect(ruleGuides["A-RR-05"].continuation).toContain("My System");
		expect(ruleGuides["A-CD-02"].check).toContain("5枚＋4枚");
		expect(ruleGuides["A-RR-08"].check).toContain("King ask");
		expect(ruleGuides["A-OB-01"].variantNotes["Rule of 10"]).toContain(
			"10未満"
		);
		expect(ruleGuides["A-CA-02"].variantNotes.Count).toContain("偶数");
	});
});
