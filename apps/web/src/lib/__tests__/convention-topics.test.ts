import {
	defaultSystemSettings,
	getConventionRules,
	JCBL_LIST_A_2026_05_01,
} from "@bridge-portal/domain";
import { describe, expect, it } from "vitest";
import {
	getConventionTopics,
	resolveConventionTopic,
	rulesForTopic,
} from "../convention-topics";

describe("convention catalog topics", () => {
	it("assigns every underlying rule to exactly one selectable topic", () => {
		for (const item of JCBL_LIST_A_2026_05_01) {
			const topics = getConventionTopics(item.officialItemId);
			const rows = getConventionRules(
				item.officialItemId,
				defaultSystemSettings
			);
			expect(new Set(topics.map((topic) => topic.key)).size).toBe(
				topics.length
			);
			const displayed = topics.flatMap((topic) => rulesForTopic(rows, topic));
			expect(displayed.map((row) => row.id).sort()).toEqual(
				rows.map((row) => row.id).sort()
			);
			expect(
				topics.every((topic) => rulesForTopic(rows, topic).length > 0)
			).toBe(true);
		}
	});
	it("separates minor and major openers while preserving their persisted variant", () => {
		const rows = getConventionRules("A-OB-01", defaultSystemSettings);
		const minor = resolveConventionTopic("A-OB-01", "natural-1m");
		const major = resolveConventionTopic("A-OB-01", "natural-1M");
		expect(minor?.variant).toBe("1-level natural");
		expect(major?.variant).toBe("1-level natural");
		if (!(minor && major)) {
			throw new Error("Missing opening topics");
		}
		expect(rulesForTopic(rows, minor).map((row) => row.action.value)).toEqual([
			"1♣",
			"1♦",
		]);
		expect(rulesForTopic(rows, major).map((row) => row.action.value)).toEqual([
			"1M",
		]);
	});
	it("keeps old JCBL links working and uses a valid fallback for unknown topics", () => {
		expect(resolveConventionTopic("A-OB-01")?.title).toBe(
			"ナチュラル1NTオープン"
		);
		expect(resolveConventionTopic("A-OB-01", "unknown")).toEqual(
			resolveConventionTopic("A-OB-01")
		);
		expect(resolveConventionTopic("A-RR-02")?.variant).toBe("Stayman");
	});
});
