import {
	boardAttempt,
	doubleDummyResult,
	historyIndex,
	tournament,
	tournamentRevision,
} from "@bridge-portal/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../index";

const id = z.string().min(1).max(128);
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
});
const historyRouter = router({
	list: protectedProcedure.query(({ ctx }) =>
		ctx.db.query.historyIndex.findMany({
			where: eq(historyIndex.userId, ctx.session.user.id),
			with: { entries: true },
			orderBy: desc(historyIndex.capturedAt),
		})
	),
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
			const doubleDummy = await ctx.db.query.doubleDummyResult.findFirst({
				where: eq(doubleDummyResult.boardAttemptId, item.id),
				orderBy: desc(doubleDummyResult.createdAt),
			});
			return { ...item, doubleDummy, tournament: revision.tournament };
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

export const appRouter = router({
	healthCheck: publicProcedure.query(() => "OK" as const),
	boards: boardsRouter,
	history: historyRouter,
	tournaments: tournamentsRouter,
});
export type AppRouter = typeof appRouter;
