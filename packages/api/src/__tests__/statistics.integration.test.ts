import { readFileSync } from "node:fs";
import {
	boardAttempt,
	boardScore,
	createDb,
	type D1Database,
	deal,
	evaluationRun,
	importRevision,
	ruleEvaluation,
	ruleEvaluationOverride,
	tournament,
	tournamentRevision,
	user,
} from "@bridge-portal/db";
import { eq } from "drizzle-orm";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { appRouter } from "../routers/index";

let miniflare: Miniflare;

async function applyMigrations(database: D1Database): Promise<void> {
	for (const filename of [
		"0000_slimy_night_nurse.sql",
		"0001_young_stepford_cuckoos.sql",
		"0002_immutable_system_versions.sql",
		"0003_dashing_lady_bullseye.sql",
	]) {
		const source = readFileSync(
			new URL(`../../../db/src/migrations/${filename}`, import.meta.url),
			"utf8"
		);
		for (const statement of source.split("--> statement-breakpoint")) {
			if (statement.trim()) {
				await database.prepare(statement).run();
			}
		}
	}
}

describe("statistics queries", () => {
	beforeAll(async () => {
		miniflare = new Miniflare({
			compatibilityDate: "2026-04-01",
			d1Databases: ["DB"],
			modules: true,
			script: "export default { fetch() { return new Response('OK') } }",
		});
		await applyMigrations(await miniflare.getD1Database("DB"));
	});

	afterAll(async () => {
		await miniflare.dispose();
	});

	it("uses only the latest run of the active revision and keeps MP/IMP separate", async () => {
		const d1 = await miniflare.getD1Database("DB");
		const db = createDb(d1);
		await db.insert(user).values({
			id: "user-1",
			email: "learner@example.test",
			name: "Learner",
		});
		await db.insert(tournament).values({
			id: "tournament-1",
			userId: "user-1",
			externalId: "daily-1",
			family: "DAILY",
			name: "Daily",
		});
		await db.insert(importRevision).values([
			{
				id: "import-old",
				userId: "user-1",
				tournamentId: "tournament-1",
				sha256: "old-hash",
				r2Key: "old.json",
				status: "ACTIVE",
				warnings: [],
			},
			{
				id: "import-active",
				userId: "user-1",
				tournamentId: "tournament-1",
				sha256: "active-hash",
				r2Key: "active.json",
				status: "ACTIVE",
				warnings: [],
			},
		]);
		await db.insert(tournamentRevision).values([
			{
				id: "revision-old",
				tournamentId: "tournament-1",
				importRevisionId: "import-old",
				revisionNumber: 1,
				completion: "COMPLETED",
				boardCount: 1,
				scoreType: "MP",
				familyMetadata: { region: "JAPAN" },
			},
			{
				id: "revision-active",
				tournamentId: "tournament-1",
				importRevisionId: "import-active",
				revisionNumber: 2,
				completion: "COMPLETED",
				boardCount: 1,
				scoreType: "IMP",
				familyMetadata: { region: "JAPAN" },
			},
		]);
		await db
			.update(tournament)
			.set({ activeRevisionId: "revision-active" })
			.where(eq(tournament.id, "tournament-1"));
		await db.insert(deal).values([
			{
				id: "deal-old",
				dealHash: "deal-old-hash",
				dealer: "N",
				vulnerability: "None",
				pbnDeal:
					"N:AKQJ.T98.765.432 9876.7654.AK.QJ5 T543.KQJ2.QJ.T98 2.A3.T98432.AK76",
			},
			{
				id: "deal-active",
				dealHash: "deal-active-hash",
				dealer: "N",
				vulnerability: "None",
				pbnDeal:
					"N:AKQJ.T98.765.432 9876.7654.AK.QJ5 T543.KQJ2.QJ.T98 2.A3.T98432.AK76",
			},
		]);
		await db.insert(boardAttempt).values([
			{
				id: "board-old",
				tournamentRevisionId: "revision-old",
				dealId: "deal-old",
				boardNumber: 1,
			},
			{
				id: "board-active",
				tournamentRevisionId: "revision-active",
				dealId: "deal-active",
				boardNumber: 1,
			},
		]);
		await db.insert(boardScore).values([
			{
				id: "score-old",
				boardAttemptId: "board-old",
				type: "MP",
				value: 99,
			},
			{
				id: "score-active",
				boardAttemptId: "board-active",
				type: "IMP",
				value: 2.5,
			},
		]);
		await db.insert(evaluationRun).values([
			{
				id: "run-inactive-revision",
				boardAttemptId: "board-old",
				rulesetVersion: "JCBL_LIST_A_2026_05_01",
				ruleEngineVersion: "2.0.0",
				completedAt: new Date("2026-05-01T00:00:00Z"),
			},
			{
				id: "run-active-older",
				boardAttemptId: "board-active",
				rulesetVersion: "JCBL_LIST_A_2026_05_01",
				ruleEngineVersion: "2.0.0",
				completedAt: new Date("2026-05-02T00:00:00Z"),
			},
			{
				id: "run-active-latest",
				boardAttemptId: "board-active",
				rulesetVersion: "JCBL_LIST_A_2026_05_01",
				ruleEngineVersion: "2.2.0",
				completedAt: new Date("2026-05-03T00:00:00Z"),
			},
		]);
		await db.insert(ruleEvaluation).values([
			{
				id: "evaluation-inactive-revision",
				evaluationRunId: "run-inactive-revision",
				ruleVersionId: "A-OB-02@2026-05-01",
				evaluationKey: "inactive",
				automaticVerdict: "COMPLIED",
				reasonCode: "INACTIVE_REVISION_MUST_NOT_COUNT",
				facts: {},
			},
			{
				id: "evaluation-older-run",
				evaluationRunId: "run-active-older",
				ruleVersionId: "A-OB-01@2026-05-01",
				evaluationKey: "older",
				automaticVerdict: "DEVIATED_WRONG_APPLICATION",
				reasonCode: "OLDER_RUN_MUST_NOT_COUNT",
				facts: {},
			},
			{
				id: "evaluation-complied",
				evaluationRunId: "run-active-latest",
				ruleVersionId: "A-OB-01@2026-05-01",
				evaluationKey: "latest-opening",
				automaticVerdict: "COMPLIED",
				reasonCode: "LATEST_COMPLIED",
				facts: {},
			},
			{
				id: "evaluation-overridden",
				evaluationRunId: "run-active-latest",
				ruleVersionId: "A-RR-01@2026-05-01",
				evaluationKey: "latest-response",
				automaticVerdict: "DEVIATED_MISSED_OPPORTUNITY",
				reasonCode: "LATEST_MISSED",
				facts: {},
			},
		]);
		await db.insert(ruleEvaluationOverride).values({
			id: "override-1",
			ruleEvaluationId: "evaluation-overridden",
			verdict: "DEVIATED_WRONG_APPLICATION",
			reason: "User-confirmed wrong application",
			correctedByUserId: "user-1",
		});

		const caller = appRouter.createCaller({
			db,
			session: {
				user: {
					id: "user-1",
					email: "learner@example.test",
					name: "Learner",
				},
			},
		});
		const [summary, breakdown, relatedActive, relatedInactive] =
			await Promise.all([
				caller.statistics.summary(),
				caller.statistics.ruleBreakdown(),
				caller.rules.relatedBoards({ officialItemId: "A-OB-01" }),
				caller.rules.relatedBoards({ officialItemId: "A-OB-02" }),
			]);

		expect(summary.counts).toEqual({
			COMPLIED: 1,
			DEVIATED_WRONG_APPLICATION: 1,
		});
		expect(summary.applicationAccuracy).toBe(0.5);
		expect(summary.usageRate).toBe(1);
		expect(summary.overallCompliance).toBe(0.5);
		expect(breakdown).toHaveLength(2);
		expect(breakdown.every((row) => row.scoreType === "IMP")).toBe(true);
		expect(breakdown.every((row) => row.averageScore === 2.5)).toBe(true);
		expect(
			breakdown.some((row) => row.ruleVersionId === "A-OB-02@2026-05-01")
		).toBe(false);
		expect(relatedActive).toEqual([
			expect.objectContaining({
				boardId: "board-active",
				verdict: "COMPLIED",
			}),
		]);
		expect(relatedInactive).toEqual([]);
	});
});
