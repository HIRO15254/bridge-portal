import { describe, expect, it } from "vitest";
import type { RulesetVersion } from "../models";
import {
	JCBL_LIST_A_2026_05_01,
	JCBL_RULESET_MANIFEST,
	type OfficialItemId,
} from "../ruleset";

const HTTPS_URL = /^https:/;
const EXPECTED_VARIANTS = {
	"A-OB-01": [
		"1-level natural",
		"Natural 1NT",
		"Natural 2NT",
		"Natural 3NT",
		"Natural 4+-level NT",
		"Natural Strong Two",
		"Weak Two",
		"Natural 3-level",
		"Natural 4+-level",
		"Rule of 10",
	],
	"A-OB-02": ["20+ HCP", "17+ HCP loser definition", "14+ HCP and 5+ controls"],
	"A-RR-01": ["Response", "Opener rebid", "Responder rebid"],
	"A-RR-02": ["Stayman"],
	"A-RR-03": ["Artificial 2D response"],
	"A-RR-04": ["Weak 2NT response"],
	"A-RR-05": ["Feature ask", "Ogust-style ask"],
	"A-RR-06": ["Blackwood", "5NT king ask", "DOPI", "DEPO", "ROPI"],
	"A-RR-07": ["4C ace ask", "5C king ask"],
	"A-RR-08": ["Grand Slam Force"],
	"A-RR-09": ["Stayman eligibility", "Gerber eligibility"],
	"A-RR-10": ["Fit-showing jump"],
	"A-CD-01": ["One-level", "Two-level"],
	"A-CD-02": ["Minors", "Two lowest unbid"],
	"A-CD-03": ["Direct", "Balancing"],
	"A-CD-04": ["Lightner"],
	"A-CD-05": ["Negative double"],
	"A-CD-06": ["SOS redouble"],
	"A-CD-07": ["Game force cue bid"],
	"A-CD-08": ["Limit raise or better"],
	"A-CA-01": [
		"Fourth highest",
		"Top of Nothing",
		"MUD",
		"Honor sequence",
		"A from AK",
		"K from AK",
	],
	"A-CA-02": ["Normal attitude", "Count", "Suit preference"],
} as const satisfies Record<OfficialItemId, readonly string[]>;

describe("JCBL List A 2026 manifest", () => {
	const typedManifest: RulesetVersion = JCBL_RULESET_MANIFEST;

	it("contains every official top-level item exactly once", () => {
		expect(typedManifest.id).toBe("JCBL_LIST_A_2026_05_01");
		expect(Object.isFrozen(JCBL_LIST_A_2026_05_01)).toBe(true);
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
			expect(Object.isFrozen(rule)).toBe(true);
			expect(Object.isFrozen(rule.variants)).toBe(true);
			expect(rule.officialUrl).toMatch(HTTPS_URL);
			expect(rule.applicability.length).toBeGreaterThan(20);
			expect(rule.evaluatorId).not.toBe("");
			expect(["AUCTION", "PLAY"]).toContain(rule.exampleKind);
			expect(rule.example.length).toBeGreaterThan(0);
			expect(rule.effectiveDate).toBe("2026-05-01");
			expect(rule.variants.length).toBeGreaterThan(0);
			expect(rule.configuration.length).toBeGreaterThan(0);
		}
	});

	it("rejects a missing or renamed official sub-variant", () => {
		for (const rule of JCBL_LIST_A_2026_05_01) {
			expect(rule.variants).toEqual(EXPECTED_VARIANTS[rule.officialItemId]);
		}
	});
});
