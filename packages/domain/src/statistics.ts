import type { RuleVerdict } from "./types";

export interface ComplianceMetrics {
	applicationAccuracy: number | null;
	counts: Partial<Record<RuleVerdict, number>>;
	overallCompliance: number | null;
	usageRate: number | null;
}

export function calculateComplianceMetrics(
	rows: ReadonlyArray<{ count: number; verdict: string }>
): ComplianceMetrics {
	const counts = Object.fromEntries(
		rows.map((row) => [row.verdict, Number(row.count)])
	) as Partial<Record<RuleVerdict, number>>;
	const complied = counts.COMPLIED ?? 0;
	const wrong = counts.DEVIATED_WRONG_APPLICATION ?? 0;
	const missed = counts.DEVIATED_MISSED_OPPORTUNITY ?? 0;
	return {
		applicationAccuracy:
			complied + wrong === 0 ? null : complied / (complied + wrong),
		counts,
		overallCompliance:
			complied + wrong + missed === 0
				? null
				: complied / (complied + wrong + missed),
		usageRate: complied + missed === 0 ? null : complied / (complied + missed),
	};
}
