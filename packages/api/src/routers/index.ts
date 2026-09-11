import {
	boardAttempt,
	boardScore,
	bridgeSystem,
	type Database,
	doubleDummyResult,
	evaluationRun,
	ruleEvaluation,
	ruleEvaluationOverride,
	systemDraft,
	systemVersion,
	tournament,
	tournamentRevision,
} from "@bridge-portal/db";
import {
	automaticRuleVerdicts,
	type BridgeDeal,
	calculateComplianceMetrics,
	defaultSystemSettings,
	evaluateBoard,
	JCBL_LIST_A_2026_05_01,
	JCBL_RULESET_MANIFEST,
	JCBL_RULESET_VERSION,
	normalizeSystemSettings,
	RULE_ENGINE_VERSION,
	type Seat,
	type SystemSnapshot,
	systemSettingsSchema,
	validateSystemDraft,
} from "@bridge-portal/domain";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, publicProcedure, router } from "../index";

const id = z.string().min(1).max(128);
const seatOrder = ["N", "E", "S", "W"] as const;
const dealPattern = /^(N|E|S|W):(.+)$/i;
const whitespacePattern = /\s+/;
const ddTableKeys = ["N", "E", "S", "W"].flatMap((seat) =>
	["S", "H", "D", "C", "NT"].map((strain) => `${seat}:${strain}`)
);
const ddTableSchema = z
	.record(z.string(), z.number().int().min(0).max(13))
	.superRefine((table, context) => {
		if (
			Object.keys(table).length !== ddTableKeys.length ||
			ddTableKeys.some((key) => table[key] === undefined)
		) {
			context.addIssue({
				code: "custom",
				message: "DD Tableには4席×5strainの20セルが必要です。",
			});
		}
	});

function bridgeDealFromStored(board: {
	boardNumber: number;
	contract: string | null;
	declarer: Seat | null;
	deal: {
		dealer: Seat;
		pbnDeal: string;
		vulnerability: BridgeDeal["vulnerability"];
	};
	result: number | null;
}): BridgeDeal | undefined {
	const match = dealPattern.exec(board.deal.pbnDeal);
	if (!match) {
		return;
	}
	const first = match[1]?.toUpperCase() as Seat;
	const values = (match[2] ?? "").trim().split(whitespacePattern);
	if (values.length !== 4) {
		return;
	}
	const hands = { N: "", E: "", S: "", W: "" };
	for (let index = 0; index < 4; index += 1) {
		const seat = seatOrder[(seatOrder.indexOf(first) + index) % 4];
		if (seat) {
			hands[seat] = values[index] ?? "";
		}
	}
	return {
		boardNumber: board.boardNumber,
		contract: board.contract ?? undefined,
		dealer: board.deal.dealer,
		declarer: board.declarer ?? undefined,
		hands,
		result: board.result ?? undefined,
		vulnerability: board.deal.vulnerability,
	};
}

async function assignSystemAndReevaluate(
	db: Database,
	boardId: string,
	version: typeof systemVersion.$inferSelect | undefined
) {
	const board = await db.query.boardAttempt.findFirst({
		where: eq(boardAttempt.id, boardId),
		with: { auctionCalls: true, deal: true, playActions: true },
	});
	if (!board) {
		return;
	}
	const parsedDeal = bridgeDealFromStored(board);
	if (!parsedDeal) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "保存済みDealを再構成できません。",
		});
	}
	const runId = crypto.randomUUID();
	const snapshot: SystemSnapshot | undefined = version
		? {
				adoptedOfficialItemIds: version.adoptedOfficialItemIds,
				name: version.name,
				rulesetVersion: version.rulesetVersion,
				selectedVariants: version.selectedVariants,
				settings: normalizeSystemSettings(version.settings),
			}
		: undefined;
	const evaluations = evaluateBoard({
		auction: board.auctionCalls.map((call) => ({
			alert: call.alert ?? undefined,
			call: call.call,
			index: call.callIndex,
			seat: call.seat,
		})),
		deal: parsedDeal,
		heroSeat: board.heroSeat ?? undefined,
		playComplete: board.playActions.length === 52,
		play: board.playActions.map((action) => ({
			card: action.card,
			index: action.actionIndex,
			seat: action.seat,
			trickNumber: action.trickNumber,
		})),
		system: snapshot,
	});
	const evaluationRows = evaluations.map((evaluation) => ({
		id: crypto.randomUUID(),
		evaluationRunId: runId,
		...evaluation,
	}));
	const evaluationInserts = Array.from(
		{ length: Math.ceil(evaluationRows.length / 10) },
		(_, chunkIndex) =>
			db
				.insert(ruleEvaluation)
				.values(evaluationRows.slice(chunkIndex * 10, chunkIndex * 10 + 10))
	);
	await db.batch([
		db
			.update(boardAttempt)
			.set({ systemVersionId: version?.id ?? null })
			.where(eq(boardAttempt.id, boardId)),
		db.insert(evaluationRun).values({
			id: runId,
			boardAttemptId: board.id,
			rulesetVersion: JCBL_RULESET_VERSION,
			ruleEngineVersion: RULE_ENGINE_VERSION,
			systemVersionId: version?.id,
			completedAt: new Date(),
		}),
		...evaluationInserts,
	]);
}

const selectedVariantsSchema = z.record(z.string(), z.array(z.string()));
const defaultSelectedVariants = Object.fromEntries(
	JCBL_LIST_A_2026_05_01.map((item) => {
		if (
			item.officialItemId === "A-OB-02" ||
			item.officialItemId === "A-RR-05"
		) {
			return [item.officialItemId, [item.variants[0]]];
		}
		if (item.officialItemId === "A-RR-06") {
			return [item.officialItemId, ["Blackwood", "5NT king ask", "DOPI"]];
		}
		if (item.officialItemId === "A-CA-01") {
			return [
				item.officialItemId,
				["Fourth highest", "Honor sequence", "A from AK"],
			];
		}
		return [item.officialItemId, [...item.variants]];
	})
) as Record<string, string[]>;

const rulesRouter = router({
	list: protectedProcedure.query(() => JCBL_LIST_A_2026_05_01),
	manifest: protectedProcedure.query(() => JCBL_RULESET_MANIFEST),
	byId: protectedProcedure
		.input(z.object({ officialItemId: id }))
		.query(({ input }) => {
			const item = JCBL_LIST_A_2026_05_01.find(
				(candidate) => candidate.officialItemId === input.officialItemId
			);
			if (!item) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "ルールが見つかりません。",
				});
			}
			return item;
		}),
	relatedBoards: protectedProcedure
		.input(z.object({ officialItemId: id }))
		.query(({ ctx, input }) => {
			const rule = JCBL_LIST_A_2026_05_01.find(
				(item) => item.officialItemId === input.officialItemId
			);
			if (!rule) {
				return [];
			}
			return ctx.db
				.select({
					boardId: boardAttempt.id,
					boardNumber: boardAttempt.boardNumber,
					tournamentName: tournament.name,
					verdict: ruleEvaluation.automaticVerdict,
				})
				.from(ruleEvaluation)
				.innerJoin(
					evaluationRun,
					eq(evaluationRun.id, ruleEvaluation.evaluationRunId)
				)
				.innerJoin(
					boardAttempt,
					eq(boardAttempt.id, evaluationRun.boardAttemptId)
				)
				.innerJoin(
					tournamentRevision,
					eq(tournamentRevision.id, boardAttempt.tournamentRevisionId)
				)
				.innerJoin(
					tournament,
					eq(tournament.id, tournamentRevision.tournamentId)
				)
				.where(
					and(
						eq(ruleEvaluation.ruleVersionId, rule.versionId),
						eq(tournament.userId, ctx.session.user.id)
					)
				)
				.orderBy(desc(evaluationRun.completedAt))
				.limit(20);
		}),
});

const systemsRouter = router({
	list: protectedProcedure.query(async ({ ctx }) => {
		const systems = await ctx.db.query.bridgeSystem.findMany({
			where: eq(bridgeSystem.userId, ctx.session.user.id),
			with: { draft: true, versions: true },
			orderBy: desc(bridgeSystem.updatedAt),
		});
		return systems.map((system) => ({
			...system,
			draft: system.draft
				? {
						...system.draft,
						settings: normalizeSystemSettings(system.draft.settings),
					}
				: system.draft,
			versions: system.versions.map((version) => ({
				...version,
				settings: normalizeSystemSettings(version.settings),
			})),
		}));
	}),
	create: protectedProcedure
		.input(z.object({ name: z.string().trim().min(1).max(100) }))
		.mutation(async ({ ctx, input }) => {
			const systemId = crypto.randomUUID();
			await ctx.db.insert(bridgeSystem).values({
				id: systemId,
				userId: ctx.session.user.id,
				name: input.name,
			});
			await ctx.db.insert(systemDraft).values({
				id: crypto.randomUUID(),
				systemId,
				rulesetVersion: JCBL_RULESET_VERSION,
				adoptedOfficialItemIds: JCBL_LIST_A_2026_05_01.map(
					(item) => item.officialItemId
				),
				selectedVariants: defaultSelectedVariants,
				settings: defaultSystemSettings,
			});
			return { id: systemId };
		}),
	updateDraft: protectedProcedure
		.input(
			z.object({
				systemId: id,
				adoptedOfficialItemIds: z.array(id),
				selectedVariants: selectedVariantsSchema,
				settings: systemSettingsSchema,
			})
		)
		.mutation(async ({ ctx, input }) => {
			const owned = await ctx.db.query.bridgeSystem.findFirst({
				where: and(
					eq(bridgeSystem.id, input.systemId),
					eq(bridgeSystem.userId, ctx.session.user.id)
				),
			});
			if (!owned) {
				throw new TRPCError({ code: "NOT_FOUND" });
			}
			await ctx.db
				.update(systemDraft)
				.set({
					adoptedOfficialItemIds: input.adoptedOfficialItemIds,
					selectedVariants: input.selectedVariants,
					settings: input.settings,
					updatedAt: new Date(),
				})
				.where(eq(systemDraft.systemId, input.systemId));
			return { ok: true as const };
		}),
	publish: protectedProcedure
		.input(z.object({ systemId: id }))
		.mutation(async ({ ctx, input }) => {
			const owned = await ctx.db.query.bridgeSystem.findFirst({
				where: and(
					eq(bridgeSystem.id, input.systemId),
					eq(bridgeSystem.userId, ctx.session.user.id)
				),
				with: { draft: true, versions: true },
			});
			if (!owned?.draft) {
				throw new TRPCError({ code: "NOT_FOUND" });
			}
			const issues = validateSystemDraft({
				adoptedOfficialItemIds: owned.draft.adoptedOfficialItemIds,
				rulesetVersion: owned.draft.rulesetVersion,
				selectedVariants: owned.draft.selectedVariants,
				settings: owned.draft.settings,
			});
			const issue = issues[0];
			if (issue) {
				throw new TRPCError({
					code: issue.code === "CONFLICT" ? "CONFLICT" : "BAD_REQUEST",
					message: issue.message,
				});
			}
			const settings = systemSettingsSchema.parse(owned.draft.settings);
			const versionNumber =
				Math.max(0, ...owned.versions.map((version) => version.versionNumber)) +
				1;
			const versionId = crypto.randomUUID();
			await ctx.db.insert(systemVersion).values({
				id: versionId,
				systemId: owned.id,
				versionNumber,
				name: owned.name,
				rulesetVersion: owned.draft.rulesetVersion,
				adoptedOfficialItemIds: owned.draft.adoptedOfficialItemIds,
				selectedVariants: owned.draft.selectedVariants,
				settings,
				publishedAt: new Date(),
			});
			return { id: versionId, versionNumber };
		}),
});

const tournamentsRouter = router({
	list: protectedProcedure.query(({ ctx }) =>
		ctx.db.query.tournament.findMany({
			where: eq(tournament.userId, ctx.session.user.id),
			orderBy: desc(tournament.updatedAt),
		})
	),
	byId: protectedProcedure
		.input(z.object({ id }))
		.query(async ({ ctx, input }) => {
			const item = await ctx.db.query.tournament.findFirst({
				where: and(
					eq(tournament.id, input.id),
					eq(tournament.userId, ctx.session.user.id)
				),
				with: { revisions: { with: { boards: { with: { score: true } } } } },
			});
			if (!item) {
				throw new TRPCError({ code: "NOT_FOUND" });
			}
			return item;
		}),
	setDefaultSystem: protectedProcedure
		.input(z.object({ tournamentId: id, systemVersionId: id.nullable() }))
		.mutation(async ({ ctx, input }) => {
			const ownedTournament = await ctx.db.query.tournament.findFirst({
				where: and(
					eq(tournament.id, input.tournamentId),
					eq(tournament.userId, ctx.session.user.id)
				),
			});
			if (!ownedTournament) {
				throw new TRPCError({ code: "NOT_FOUND" });
			}
			let version: typeof systemVersion.$inferSelect | undefined;
			if (input.systemVersionId) {
				const candidate = await ctx.db.query.systemVersion.findFirst({
					where: eq(systemVersion.id, input.systemVersionId),
					with: { system: true },
				});
				if (candidate?.system.userId !== ctx.session.user.id) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "System Versionを選び直してください。",
					});
				}
				version = candidate;
			}
			const storedBoards = await ctx.db
				.select({
					id: boardAttempt.id,
					systemVersionId: boardAttempt.systemVersionId,
				})
				.from(boardAttempt)
				.innerJoin(
					tournamentRevision,
					eq(boardAttempt.tournamentRevisionId, tournamentRevision.id)
				)
				.where(eq(tournamentRevision.tournamentId, input.tournamentId));
			await ctx.db
				.update(tournament)
				.set({
					defaultSystemVersionId: input.systemVersionId,
					updatedAt: new Date(),
				})
				.where(eq(tournament.id, input.tournamentId));
			for (const board of storedBoards) {
				if (board.systemVersionId === ownedTournament.defaultSystemVersionId) {
					await assignSystemAndReevaluate(ctx.db, board.id, version);
				}
			}
			return { ok: true as const };
		}),
});

const boardsRouter = router({
	byId: protectedProcedure
		.input(z.object({ id }))
		.query(async ({ ctx, input }) => {
			const item = await ctx.db.query.boardAttempt.findFirst({
				where: eq(boardAttempt.id, input.id),
				with: {
					deal: true,
					auctionCalls: true,
					playActions: true,
					score: true,
					systemVersion: true,
				},
			});
			if (!item) {
				throw new TRPCError({ code: "NOT_FOUND" });
			}
			const revision = await ctx.db.query.tournamentRevision.findFirst({
				where: eq(tournamentRevision.id, item.tournamentRevisionId),
				with: { tournament: true },
			});
			if (revision?.tournament.userId !== ctx.session.user.id) {
				throw new TRPCError({ code: "NOT_FOUND" });
			}
			const run = await ctx.db.query.evaluationRun.findFirst({
				where: eq(evaluationRun.boardAttemptId, item.id),
				orderBy: desc(evaluationRun.completedAt),
			});
			const evaluations = run
				? await ctx.db.query.ruleEvaluation.findMany({
						where: eq(ruleEvaluation.evaluationRunId, run.id),
						with: { override: true },
					})
				: [];
			const doubleDummy = await ctx.db.query.doubleDummyResult.findFirst({
				where: eq(doubleDummyResult.boardAttemptId, item.id),
				orderBy: desc(doubleDummyResult.createdAt),
			});
			return {
				...item,
				doubleDummy,
				evaluationRun: run,
				evaluations,
				tournament: revision.tournament,
			};
		}),
	reevaluate: protectedProcedure
		.input(z.object({ boardId: id }))
		.mutation(async ({ ctx, input }) => {
			const board = await ctx.db.query.boardAttempt.findFirst({
				where: eq(boardAttempt.id, input.boardId),
				with: { tournamentRevision: { with: { tournament: true } } },
			});
			if (board?.tournamentRevision.tournament.userId !== ctx.session.user.id) {
				throw new TRPCError({ code: "NOT_FOUND" });
			}
			const version = board.systemVersionId
				? await ctx.db.query.systemVersion.findFirst({
						where: eq(systemVersion.id, board.systemVersionId),
					})
				: undefined;
			await assignSystemAndReevaluate(ctx.db, board.id, version);
			return { ruleEngineVersion: RULE_ENGINE_VERSION };
		}),
	override: protectedProcedure
		.input(
			z.object({
				evaluationId: id,
				verdict: z.enum(automaticRuleVerdicts),
				reason: z.string().trim().min(3).max(1000),
			})
		)
		.mutation(async ({ ctx, input }) => {
			const [ownedEvaluation] = await ctx.db
				.select({ id: ruleEvaluation.id })
				.from(ruleEvaluation)
				.innerJoin(
					evaluationRun,
					eq(evaluationRun.id, ruleEvaluation.evaluationRunId)
				)
				.innerJoin(
					boardAttempt,
					eq(boardAttempt.id, evaluationRun.boardAttemptId)
				)
				.innerJoin(
					tournamentRevision,
					eq(tournamentRevision.id, boardAttempt.tournamentRevisionId)
				)
				.innerJoin(
					tournament,
					eq(tournament.id, tournamentRevision.tournamentId)
				)
				.where(
					and(
						eq(ruleEvaluation.id, input.evaluationId),
						eq(tournament.userId, ctx.session.user.id)
					)
				)
				.limit(1);
			if (!ownedEvaluation) {
				throw new TRPCError({ code: "NOT_FOUND" });
			}
			await ctx.db
				.insert(ruleEvaluationOverride)
				.values({
					id: crypto.randomUUID(),
					ruleEvaluationId: input.evaluationId,
					verdict: input.verdict,
					reason: input.reason,
					correctedByUserId: ctx.session.user.id,
				})
				.onConflictDoUpdate({
					target: ruleEvaluationOverride.ruleEvaluationId,
					set: {
						createdAt: new Date(),
						verdict: input.verdict,
						reason: input.reason,
						correctedByUserId: ctx.session.user.id,
					},
				});
			return { ok: true as const };
		}),
	setSystem: protectedProcedure
		.input(z.object({ boardId: id, systemVersionId: id.nullable() }))
		.mutation(async ({ ctx, input }) => {
			const board = await ctx.db.query.boardAttempt.findFirst({
				where: eq(boardAttempt.id, input.boardId),
				with: {
					auctionCalls: true,
					deal: true,
					playActions: true,
					tournamentRevision: { with: { tournament: true } },
				},
			});
			if (board?.tournamentRevision.tournament.userId !== ctx.session.user.id) {
				throw new TRPCError({ code: "NOT_FOUND" });
			}
			let version: typeof systemVersion.$inferSelect | undefined;
			if (input.systemVersionId) {
				const candidate = await ctx.db.query.systemVersion.findFirst({
					where: eq(systemVersion.id, input.systemVersionId),
					with: { system: true },
				});
				if (candidate?.system.userId !== ctx.session.user.id) {
					throw new TRPCError({ code: "BAD_REQUEST" });
				}
				version = candidate;
			}
			await assignSystemAndReevaluate(ctx.db, board.id, version);
			return { ok: true as const };
		}),
	saveDoubleDummy: protectedProcedure
		.input(
			z.object({
				actualContractMaxTricks: z.number().int().min(0).max(13).nullable(),
				boardId: id,
				ddTable: ddTableSchema,
				par: z.object({
					contracts: z.array(z.string()),
					score: z.number().int(),
				}),
				solverVersion: z.string().min(1).max(50),
			})
		)
		.mutation(async ({ ctx, input }) => {
			const board = await ctx.db.query.boardAttempt.findFirst({
				where: eq(boardAttempt.id, input.boardId),
				with: {
					deal: true,
					tournamentRevision: { with: { tournament: true } },
				},
			});
			if (board?.tournamentRevision.tournament.userId !== ctx.session.user.id) {
				throw new TRPCError({ code: "NOT_FOUND" });
			}
			await ctx.db
				.insert(doubleDummyResult)
				.values({
					id: crypto.randomUUID(),
					actualContractMaxTricks: input.actualContractMaxTricks,
					boardAttemptId: board.id,
					ddTable: input.ddTable,
					dealHash: board.deal.dealHash,
					par: input.par,
					solverVersion: input.solverVersion,
				})
				.onConflictDoUpdate({
					target: [
						doubleDummyResult.boardAttemptId,
						doubleDummyResult.solverVersion,
					],
					set: {
						actualContractMaxTricks: input.actualContractMaxTricks,
						ddTable: input.ddTable,
						par: input.par,
					},
				});
			return { ok: true as const };
		}),
});

const statisticsRouter = router({
	summary: protectedProcedure.query(async ({ ctx }) => {
		const effectiveVerdict = sql<string>`coalesce(${ruleEvaluationOverride.verdict}, ${ruleEvaluation.automaticVerdict})`;
		const tournamentIds = ctx.db
			.select({ id: tournament.id })
			.from(tournament)
			.where(eq(tournament.userId, ctx.session.user.id));
		const rows = await ctx.db
			.select({
				verdict: effectiveVerdict,
				count: sql<number>`count(*)`,
			})
			.from(ruleEvaluation)
			.innerJoin(
				evaluationRun,
				eq(evaluationRun.id, ruleEvaluation.evaluationRunId)
			)
			.innerJoin(
				boardAttempt,
				eq(boardAttempt.id, evaluationRun.boardAttemptId)
			)
			.innerJoin(
				tournamentRevision,
				eq(tournamentRevision.id, boardAttempt.tournamentRevisionId)
			)
			.leftJoin(
				ruleEvaluationOverride,
				eq(ruleEvaluationOverride.ruleEvaluationId, ruleEvaluation.id)
			)
			.where(
				and(
					inArray(tournamentRevision.tournamentId, tournamentIds),
					sql`${evaluationRun.id} = (
						select latest.id from evaluation_run as latest
						where latest.board_attempt_id = ${boardAttempt.id}
						order by latest.completed_at desc, latest.rowid desc limit 1
					)`
				)
			)
			.groupBy(effectiveVerdict);
		return {
			engineVersion: RULE_ENGINE_VERSION,
			...calculateComplianceMetrics(
				rows.map((row) => ({ count: Number(row.count), verdict: row.verdict }))
			),
		};
	}),
	ruleBreakdown: protectedProcedure.query(({ ctx }) => {
		const effectiveVerdict = sql<string>`coalesce(${ruleEvaluationOverride.verdict}, ${ruleEvaluation.automaticVerdict})`;
		const tournamentIds = ctx.db
			.select({ id: tournament.id })
			.from(tournament)
			.where(eq(tournament.userId, ctx.session.user.id));
		return ctx.db
			.select({
				averageScore: sql<number | null>`avg(${boardScore.value})`,
				contractMadeRate: sql<
					number | null
				>`avg(case when ${boardScore.contractMade} = 1 then 1.0 when ${boardScore.contractMade} = 0 then 0.0 end)`,
				family: tournament.family,
				ruleVersionId: ruleEvaluation.ruleVersionId,
				sampleCount: sql<number>`count(*)`,
				scoreType: boardScore.type,
				systemVersionId: evaluationRun.systemVersionId,
				systemVersionName: systemVersion.name,
				systemVersionNumber: systemVersion.versionNumber,
				verdict: effectiveVerdict,
			})
			.from(ruleEvaluation)
			.innerJoin(
				evaluationRun,
				eq(evaluationRun.id, ruleEvaluation.evaluationRunId)
			)
			.innerJoin(
				boardAttempt,
				eq(boardAttempt.id, evaluationRun.boardAttemptId)
			)
			.innerJoin(
				tournamentRevision,
				eq(tournamentRevision.id, boardAttempt.tournamentRevisionId)
			)
			.innerJoin(tournament, eq(tournament.id, tournamentRevision.tournamentId))
			.leftJoin(boardScore, eq(boardScore.boardAttemptId, boardAttempt.id))
			.leftJoin(
				systemVersion,
				eq(systemVersion.id, evaluationRun.systemVersionId)
			)
			.leftJoin(
				ruleEvaluationOverride,
				eq(ruleEvaluationOverride.ruleEvaluationId, ruleEvaluation.id)
			)
			.where(
				and(
					inArray(tournamentRevision.tournamentId, tournamentIds),
					sql`${evaluationRun.id} = (
						select latest.id from evaluation_run as latest
						where latest.board_attempt_id = ${boardAttempt.id}
						order by latest.completed_at desc, latest.rowid desc limit 1
					)`
				)
			)
			.groupBy(
				ruleEvaluation.ruleVersionId,
				effectiveVerdict,
				tournament.family,
				boardScore.type,
				evaluationRun.systemVersionId,
				systemVersion.name,
				systemVersion.versionNumber
			);
	}),
});

export const appRouter = router({
	healthCheck: publicProcedure.query(() => "OK" as const),
	rules: rulesRouter,
	systems: systemsRouter,
	tournaments: tournamentsRouter,
	boards: boardsRouter,
	statistics: statisticsRouter,
});

export type AppRouter = typeof appRouter;
