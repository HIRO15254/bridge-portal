import { describe, expect, it } from "vitest";

import { schema } from "../schema";

describe("Bridge Portal database schema", () => {
	it("contains the complete persistence boundary", () => {
		expect(Object.keys(schema)).toEqual(
			expect.arrayContaining([
				"user",
				"systemVersion",
				"tournament",
				"tournamentRevision",
				"deal",
				"boardAttempt",
				"auctionCall",
				"playAction",
				"ruleEvaluation",
				"doubleDummyResult",
			])
		);
	});
});
