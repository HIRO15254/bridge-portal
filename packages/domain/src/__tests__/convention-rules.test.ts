import { describe, expect, it } from "vitest";
import { conventionSources, getConventionRules } from "../convention-rules";
import { describeConventionTerm, isBalancedHand } from "../convention-terms";
import { evaluateOfficialItem } from "../evaluator";
import { JCBL_LIST_A_2026_05_01, JCBL_RULESET_VERSION } from "../ruleset";
import { normalizeSystemSettings, validateSystemDraft } from "../system";
import {
	defaultSystemSettings,
	type SystemSettings,
	type SystemSnapshot,
	systemSettingsSchema,
} from "../types";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const makeSystem = (
	settings = clone(defaultSystemSettings)
): SystemSnapshot => ({
	name: "rules",
	settings,
	rulesetVersion: JCBL_RULESET_VERSION,
	adoptedOfficialItemIds: ["A-OB-01", "A-RR-02"],
	selectedVariants: {
		"A-OB-01": ["Natural 1NT", "1-level natural"],
		"A-RR-02": ["Stayman"],
	},
});
const opening = (settings: SystemSettings, hand: string, call = "1NT") =>
	evaluateOfficialItem("A-OB-01", {
		system: makeSystem(settings),
		heroSeat: "N",
		playComplete: false,
		auction: [{ call, index: 0, seat: "N" }],
		deal: {
			boardNumber: 1,
			dealer: "N",
			vulnerability: "None",
			hands: { N: hand, E: "", S: "", W: "" },
		},
	});

describe("convention rule sets", () => {
	it("covers every selectable variant under all 22 categories", () => {
		for (const item of JCBL_LIST_A_2026_05_01) {
			const rules = getConventionRules(
				item.officialItemId,
				defaultSystemSettings
			);
			expect(new Set(rules.map((rule) => rule.variant))).toEqual(
				new Set(item.variants)
			);
			expect(new Set(rules.map((rule) => rule.id)).size).toBe(rules.length);
			expect(conventionSources[item.officialItemId].funbridge).toBeTruthy();
			for (const rule of rules) {
				expect(rule.when.all.length).toBeGreaterThan(0);
				expect(rule.action.value).toBeTruthy();
				expect(rule.explanation).toBeTruthy();
			}
		}
	});
	it("uses the common definition for annotations and real opening evaluation", () => {
		const settings = clone(defaultSystemSettings);
		const hand = "AKQJ2.K32.Q32.32"; // 16 HCP, 5332
		expect(opening(settings, hand).automaticVerdict).toBe("COMPLIED");
		settings.handDefinitions.balancedShapes = ["4333", "4432"];
		expect(describeConventionTerm("balanced", settings)).not.toContain("5332");
		expect(isBalancedHand(hand, settings)).toBe(false);
		expect(opening(settings, hand).automaticVerdict).toBe(
			"DEVIATED_WRONG_APPLICATION"
		);
		const rule = getConventionRules("A-OB-01", settings).find(
			(entry) => entry.variant === "Natural 1NT"
		);
		expect(rule?.when.all).toContainEqual({ kind: "term", term: "balanced" });
		expect(JSON.stringify(rule?.when)).not.toContain("5332");
	});
	it("keeps 5-card-major eligibility separate from the balanced definition", () => {
		const settings = clone(defaultSystemSettings);
		const hand = "AKQJ2.K32.Q32.32";
		expect(opening(settings, hand, "1S").reasonCode).toBe(
			"NATURAL_1NT_PRIORITY_NOT_FOLLOWED"
		);
		settings.opening.oneNtFiveCardMajor = false;
		expect(isBalancedHand(hand, settings)).toBe(true);
		expect(opening(settings, hand).automaticVerdict).toBe(
			"DEVIATED_WRONG_APPLICATION"
		);
		expect(opening(settings, hand, "1S").automaticVerdict).toBe("COMPLIED");
	});
	it("retains legacy 5422 behavior explicitly without mutating the saved snapshot", () => {
		const legacy = clone(defaultSystemSettings) as unknown as Record<
			string,
			unknown
		>;
		legacy.handDefinitions = undefined;
		const normalized = normalizeSystemSettings(legacy);
		expect(normalized.handDefinitions.balancedShapes).toContain("5422");
		expect(legacy.handDefinitions).toBeUndefined();
		expect(defaultSystemSettings.handDefinitions.balancedShapes).not.toContain(
			"5422"
		);
		expect(isBalancedHand("AKQJ2.K432.Q3.32", normalized)).toBe(true);
		expect(isBalancedHand("AKQJ2.K432.Q3.32", defaultSystemSettings)).toBe(
			false
		);
	});
	it("rejects empty or repeated shapes and enforces List A NT convention eligibility", () => {
		const settings = clone(defaultSystemSettings);
		expect(
			systemSettingsSchema.safeParse({
				...settings,
				handDefinitions: { balancedShapes: [] },
			}).success
		).toBe(false);
		settings.opening.oneNtMinHcp = 12;
		settings.opening.oneNtMaxHcp = 14;
		expect(validateSystemDraft(makeSystem(settings))).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ officialItemId: "A-RR-09" }),
			])
		);
		const withoutStayman = makeSystem(settings);
		withoutStayman.adoptedOfficialItemIds = ["A-OB-01"];
		expect(validateSystemDraft(withoutStayman)).toEqual([]);
	});
	it("evaluates the weak Stayman continuation only when selected", () => {
		const settings = clone(defaultSystemSettings);
		settings.responseRebid.weakStayman = true;
		const system = makeSystem(settings);
		const input = {
			system,
			heroSeat: "N" as const,
			playComplete: false,
			deal: {
				boardNumber: 1,
				dealer: "S" as const,
				vulnerability: "None" as const,
				hands: { N: "J432.5432.5432.2", S: "", E: "", W: "" },
			},
			auction: [
				{ seat: "S" as const, call: "1NT", index: 0 },
				{ seat: "W" as const, call: "PASS", index: 1 },
				{ seat: "N" as const, call: "2C", index: 2 },
				{ seat: "E" as const, call: "PASS", index: 3 },
				{ seat: "S" as const, call: "2H", index: 4 },
				{ seat: "W" as const, call: "PASS", index: 5 },
				{ seat: "N" as const, call: "PASS", index: 6 },
			],
		};
		expect(evaluateOfficialItem("A-RR-02", input).reasonCode).toBe(
			"WEAK_STAYMAN_SIGNOFF_COMPLIED"
		);
		const nextCall = input.auction[6];
		if (!nextCall) {
			throw new Error("Missing response fixture");
		}
		nextCall.call = "2NT";
		expect(evaluateOfficialItem("A-RR-02", input).reasonCode).toBe(
			"WEAK_STAYMAN_SIGNOFF_REQUIRED"
		);
		settings.responseRebid.weakStayman = false;
		expect(evaluateOfficialItem("A-RR-02", input).automaticVerdict).toBe(
			"DEVIATED_WRONG_APPLICATION"
		);
	});
	it("keeps the NT system constraint out of per-hand bidding accuracy", () => {
		const system = makeSystem();
		system.adoptedOfficialItemIds.push("A-RR-09");
		const input = {
			system,
			heroSeat: "N" as const,
			playComplete: false,
			auction: [{ call: "PASS", index: 0, seat: "N" as const }],
			deal: {
				boardNumber: 1,
				dealer: "N" as const,
				vulnerability: "None" as const,
				hands: { N: "AKQJ2.K32.Q32.32", E: "", S: "", W: "" },
			},
		};
		expect(evaluateOfficialItem("A-RR-09", input).automaticVerdict).toBe(
			"NOT_APPLICABLE"
		);
		system.settings.opening.oneNtMinHcp = 12;
		expect(evaluateOfficialItem("A-RR-09", input).reasonCode).toBe(
			"INVALID_SYSTEM_NT_CONVENTION_RANGE"
		);
	});
});
