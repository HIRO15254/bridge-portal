import { describe, expect, it } from "vitest";

import { calculateComplianceMetrics } from "../statistics";

describe("compliance metrics", () => {
	it("uses the fixed denominators and excludes indeterminate/non-applicable", () => {
		const metrics = calculateComplianceMetrics([
			{ count: 6, verdict: "COMPLIED" },
			{ count: 2, verdict: "DEVIATED_WRONG_APPLICATION" },
			{ count: 4, verdict: "DEVIATED_MISSED_OPPORTUNITY" },
			{ count: 100, verdict: "INDETERMINATE" },
			{ count: 100, verdict: "NOT_APPLICABLE" },
		]);

		expect(metrics.applicationAccuracy).toBe(0.75);
		expect(metrics.usageRate).toBe(0.6);
		expect(metrics.overallCompliance).toBe(0.5);
	});

	it("returns null when a metric has no eligible observations", () => {
		const metrics = calculateComplianceMetrics([
			{ count: 2, verdict: "INDETERMINATE" },
		]);

		expect(metrics.applicationAccuracy).toBeNull();
		expect(metrics.usageRate).toBeNull();
		expect(metrics.overallCompliance).toBeNull();
	});
});
