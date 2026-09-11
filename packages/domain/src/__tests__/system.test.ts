import { describe, expect, it } from "vitest";
import { JCBL_LIST_A_2026_05_01, JCBL_RULESET_VERSION } from "../ruleset";
import {
	normalizeSystemSettings,
	resolveRuleTemplate,
	validateSystemDraft,
} from "../system";
import { defaultSystemSettings } from "../types";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function selectedVariantsFor(
	officialItemId: string,
	variants: readonly string[]
) {
	if (officialItemId === "A-RR-05") {
		return ["Feature ask"];
	}
	if (officialItemId === "A-RR-06") {
		return ["Blackwood", "5NT king ask", "DOPI"];
	}
	if (officialItemId === "A-CA-01") {
		return ["Fourth highest", "Honor sequence", "A from AK"];
	}
	return [...variants];
}

const allVariants = Object.fromEntries(
	JCBL_LIST_A_2026_05_01.map((rule) => [
		rule.officialItemId,
		selectedVariantsFor(rule.officialItemId, rule.variants),
	])
);

const validDraft = () => ({
	adoptedOfficialItemIds: JCBL_LIST_A_2026_05_01.map(
		(rule) => rule.officialItemId
	),
	rulesetVersion: JCBL_RULESET_VERSION,
	selectedVariants: clone(allVariants),
	settings: clone(defaultSystemSettings),
});

describe("system settings", () => {
	it("upgrades settings saved before new required fields existed", () => {
		const { competitive: _competitive, ...legacy } = clone(
			defaultSystemSettings
		);
		const {
			allowSingletonTopHonor: _singleton,
			fourPlusNtMaxHcp: _fourPlusNtMax,
			fourPlusNtMinHcp: _fourPlusNtMin,
			fourPlusLevelMaxHcp: _fourPlusMax,
			fourPlusLevelMinHcp: _fourPlusMin,
			fourPlusLevelMinLength: _fourPlusLength,
			naturalStrongTwoMinLength: _strongTwoLength,
			threeLevelMaxHcp: _threeLevelMax,
			threeLevelMinHcp: _threeLevelMin,
			threeLevelMinLength: _threeLevelLength,
			threeNtMaxHcp: _threeNtMax,
			threeNtMinHcp: _threeNtMin,
			twoNtMaxHcp: _twoNtMax,
			twoNtMinHcp: _twoNtMin,
			...legacyOpening
		} = legacy.opening;
		const { blackwoodMinHcp: _blackwood, ...legacyResponse } =
			legacy.responseRebid;
		const legacySettings = {
			...legacy,
			opening: legacyOpening,
			responseRebid: legacyResponse,
		};

		const normalized = normalizeSystemSettings(legacySettings);

		expect(normalized.competitive.takeoutDoubleMinHcp).toBe(12);
		expect(normalized.competitive.balancingTakeoutDoubleMinHcp).toBe(9);
		expect(normalized.opening.allowSingletonTopHonor).toBe(false);
		expect(normalized.opening.fourPlusNtMinHcp).toBe(28);
		expect(normalized.opening.naturalStrongTwoMinLength).toBe(5);
		expect(normalized.opening.threeLevelMinHcp).toBe(5);
		expect(normalized.opening.twoNtMaxHcp).toBe(22);
		expect(normalized.responseRebid.blackwoodMinHcp).toBe(16);
		expect(normalized.responseRebid.weakTwoFeatureMinimumHonor).toBe("K");
	});

	it("accepts a complete List A draft including all three strong 2C definitions", () => {
		expect(validateSystemDraft(validDraft())).toEqual([]);
	});

	it("does not publish a legacy draft until required settings are saved", () => {
		const draft = validDraft();
		const settings = draft.settings as unknown as Record<string, unknown>;
		settings.competitive = undefined;

		expect(validateSystemDraft(draft).map((issue) => issue.code)).toContain(
			"INVALID_SETTING"
		);
	});

	it("rejects a missing or unknown variant", () => {
		const draft = validDraft();
		draft.selectedVariants["A-RR-02"] = [];
		draft.selectedVariants["A-RR-03"] = ["unknown"];

		expect(validateSystemDraft(draft).map((issue) => issue.code)).toEqual(
			expect.arrayContaining(["MISSING_VARIANT", "INVALID_VARIANT"])
		);
	});

	it("rejects equal-condition DOPI/DEPO and lead-style conflicts", () => {
		const draft = validDraft();
		draft.selectedVariants["A-RR-06"] = ["Blackwood", "DOPI", "DEPO"];
		draft.selectedVariants["A-CA-01"] = [
			"Fourth highest",
			"MUD",
			"Honor sequence",
			"A from AK",
		];

		const conflicts = validateSystemDraft(draft).filter(
			(issue) => issue.code === "CONFLICT"
		);
		expect(conflicts.map((issue) => issue.officialItemId)).toEqual([
			"A-RR-06",
			"A-CA-01",
		]);
	});

	it("rejects invalid ranges and duplicate signal priorities", () => {
		const draft = validDraft();
		draft.settings.opening.oneNtMinHcp = 18;
		draft.settings.opening.oneNtMaxHcp = 15;
		draft.settings.opening.threeLevelMinHcp = 11;
		draft.settings.opening.threeLevelMaxHcp = 10;
		draft.settings.opening.fourPlusNtMinHcp = 37;
		draft.settings.opening.fourPlusNtMaxHcp = 36;
		draft.settings.signal.priority = ["ATTITUDE", "ATTITUDE", "COUNT"];

		const issues = validateSystemDraft(draft);
		expect(issues.map((issue) => issue.code)).toEqual(
			expect.arrayContaining(["INVALID_RANGE", "INVALID_SETTING"])
		);
		expect(
			issues.some((issue) => issue.message.includes("3-level Opening"))
		).toBe(true);
		expect(
			issues.some((issue) => issue.message.includes("4+-level NT Opening"))
		).toBe(true);
	});

	it("rejects overlapping weak and natural strong two ranges", () => {
		const draft = validDraft();
		draft.settings.opening.weakTwoMaxHcp = 20;
		draft.settings.opening.naturalStrongTwoMinHcp = 20;

		expect(validateSystemDraft(draft).map((issue) => issue.code)).toContain(
			"CONFLICT"
		);
	});

	it("rejects convention continuations without their prerequisite variant", () => {
		const draft = validDraft();
		draft.selectedVariants["A-OB-01"] = ["Rule of 10"];
		draft.adoptedOfficialItemIds = draft.adoptedOfficialItemIds.filter(
			(id) => id !== "A-OB-02"
		);
		draft.selectedVariants["A-RR-06"] = ["5NT king ask"];
		draft.selectedVariants["A-RR-07"] = ["5C king ask"];

		const issues = validateSystemDraft(draft).filter(
			(issue) => issue.code === "MISSING_VARIANT"
		);

		expect(issues.map((issue) => issue.officialItemId)).toEqual(
			expect.arrayContaining([
				"A-OB-01",
				"A-RR-02",
				"A-RR-03",
				"A-RR-04",
				"A-RR-05",
				"A-RR-06",
				"A-RR-07",
			])
		);
	});
});

describe("rule template resolution", () => {
	it("prefers the more specific matching auction condition", () => {
		const winner = resolveRuleTemplate(
			[
				{
					condition: { auction: "competitive" },
					officialItemId: "test",
					priority: 100,
					templateId: "general",
					variant: "general",
				},
				{
					condition: { auction: "competitive", level: 2 },
					officialItemId: "test",
					priority: 10,
					templateId: "specific",
					variant: "specific",
				},
			],
			{ auction: "competitive", level: 2 }
		);

		expect(winner?.templateId).toBe("specific");
	});

	it("uses code priority only after auction specificity", () => {
		const winner = resolveRuleTemplate(
			[
				{
					condition: { auction: "competitive", level: 2 },
					officialItemId: "test",
					priority: 10,
					templateId: "lower-priority-specific",
					variant: "specific",
				},
				{
					condition: { auction: "competitive", level: 2 },
					officialItemId: "test",
					priority: 20,
					templateId: "higher-priority-specific",
					variant: "specific-priority",
				},
			],
			{ auction: "competitive", level: 2 }
		);

		expect(winner?.templateId).toBe("higher-priority-specific");
	});

	it("rejects an unresolved equal-specificity tie", () => {
		expect(() =>
			resolveRuleTemplate(
				[
					{
						condition: { auction: "competitive" },
						officialItemId: "test",
						priority: 10,
						templateId: "one",
						variant: "one",
					},
					{
						condition: { auction: "competitive" },
						officialItemId: "test",
						priority: 10,
						templateId: "two",
						variant: "two",
					},
				],
				{ auction: "competitive" }
			)
		).toThrow("Rule template conflict");
	});
});
