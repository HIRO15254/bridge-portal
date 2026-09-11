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
	type BridgeDeal,
	defaultSystemSettings,
	evaluateBoard,
	JCBL_LIST_A_2026_05_01,
	JCBL_RULESET_VERSION,
	RULE_ENGINE_VERSION,
	ruleVerdicts,
	type Seat,
	type SystemSnapshot,
	systemSettingsSchema,
} from "@bridge-portal/domain";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, publicProcedure, router } from "../index";

const id = z.string().min(1).max(128);
const seatOrder = ["N", "E", "S", "W"] as const;
const dealPattern = /^(N|E|S|W):(.+)$/i;
const whitespacePattern = /\s+/;

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
	await db
		.update(boardAttempt)
		.set({ systemVersionId: version?.id ?? null })
		.where(eq(boardAttempt.id, boardId));
	const parsedDeal = bridgeDealFromStored(board);
	if (!parsedDeal) {
		return;
	}
	const runId = crypto.randomUUID();
	const snapshot: SystemSnapshot | undefined = version
		? {
				adoptedOfficialItemIds: version.adoptedOfficialItemIds,
				name: version.name,
				rulesetVersion: version.rulesetVersion,
				selectedVariants: version.selectedVariants,
				settings: version.settings,
			}
		: undefined;
	await db.insert(evaluationRun).values({
		id: runId,
		boardAttemptId: board.id,
		rulesetVersion: JCBL_RULESET_VERSION,
		ruleEngineVersion: RULE_ENGINE_VERSION,
		systemVersionId: version?.id,
		completedAt: new Date(),
	});
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
	for (let offset = 0; offset < evaluationRows.length; offset += 10) {
		await db
			.insert(ruleEvaluation)
			.values(evaluationRows.slice(offset, offset + 10));
	}
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
	list: protectedProcedure.query(({ ctx }) =>
		ctx.db.query.bridgeSystem.findMany({
			where: eq(bridgeSystem.userId, ctx.session.user.id),
			with: { draft: true, versions: true },
			orderBy: desc(bridgeSystem.updatedAt),
		})
	),
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
			const settings = systemSettingsSchema.parse(owned.draft.settings);
			if (settings.opening.oneNtMinHcp > settings.opening.oneNtMaxHcp) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "1NTの下限が上限を超えています。",
				});
			}
			if (settings.opening.weakTwoMinHcp > settings.opening.weakTwoMaxHcp) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Weak Twoの下限が上限を超えています。",
				});
			}
			const adoptedRules = JCBL_LIST_A_2026_05_01.filter((item) =>
				owned.draft?.adoptedOfficialItemIds.includes(item.officialItemId)
			);
			for (const rule of adoptedRules) {
				const variants =
					owned.draft.selectedVariants[rule.officialItemId] ?? [];
				if (
					variants.length === 0 ||
					variants.some((variant) => !rule.variants.includes(variant as never))
				) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `${rule.officialItemId}のVariant設定が不完全です。`,
					});
				}
			}
			const strongDefinitions = owned.draft.selectedVariants["A-OB-02"] ?? [];
			if (strongDefinitions.length > 1) {
				throw new TRPCError({
					code: "CONFLICT",
					message:
						"強いハンドの定義が同一条件で競合しています。1つに絞ってください。",
				});
			}
			const openingLeads = owned.draft.selectedVariants["A-CA-01"] ?? [];
			if (
				openingLeads.includes("A from AK") &&
				openingLeads.includes("K from AK")
			) {
				throw new TRPCError({
					code: "CONFLICT",
					message:
						"AKからのLead設定が競合しています。AまたはKを選んでください。",
				});
			}
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
	override: protectedProcedure
		.input(
			z.object({
				evaluationId: id,
				verdict: z.enum(ruleVerdicts),
				reason: z.string().trim().min(3).max(1000),
			})
		)
		.mutation(async ({ ctx, input }) => {
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
				ddTable: z.record(z.string(), z.number().int().min(0).max(13)),
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
		const tournamentIds = ctx.db
			.select({ id: tournament.id })
			.from(tournament)
			.where(eq(tournament.userId, ctx.session.user.id));
		const rows = await ctx.db
			.select({
				verdict: ruleEvaluation.automaticVerdict,
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
			.groupBy(ruleEvaluation.automaticVerdict);
		const counts = Object.fromEntries(
			rows.map((row) => [row.verdict, Number(row.count)])
		);
		const complied = counts.COMPLIED ?? 0;
		const wrong = counts.DEVIATED_WRONG_APPLICATION ?? 0;
		const missed = counts.DEVIATED_MISSED_OPPORTUNITY ?? 0;
		return {
			engineVersion: RULE_ENGINE_VERSION,
			counts,
			applicationAccuracy:
				complied + wrong === 0 ? null : complied / (complied + wrong),
			usageRate:
				complied + missed === 0 ? null : complied / (complied + missed),
			overallCompliance:
				complied + wrong + missed === 0
					? null
					: complied / (complied + wrong + missed),
		};
	}),
	ruleBreakdown: protectedProcedure.query(({ ctx }) => {
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
			.innerJoin(tournament, eq(tournament.id, tournamentRevision.tournamentId))
			.leftJoin(boardScore, eq(boardScore.boardAttemptId, boardAttempt.id))
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
				ruleEvaluation.automaticVerdict,
				tournament.family,
				boardScore.type,
				evaluationRun.systemVersionId
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
