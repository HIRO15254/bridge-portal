import { createContextFactory } from "@bridge-portal/api/context";
import { appRouter } from "@bridge-portal/api/routers/index";
import { constantTimeEqual, createAuth } from "@bridge-portal/auth";
import {
	auctionCall,
	boardAttempt,
	boardScore,
	createDb,
	deal,
	doubleDummyResult,
	historyIndex,
	historyIndexEntry,
	importRevision,
	playAction,
	tournament,
	tournamentRevision,
	user,
} from "@bridge-portal/db";
import {
	contractResultToTricks,
	createDoubleDummyPbnTags,
	dealToPbn,
	exportPbn,
	type PbnGame,
	parseFunbridgeJson,
	type Seat,
} from "@bridge-portal/domain";
import { createServerEnv } from "@bridge-portal/env/server";
import { trpcServer } from "@hono/trpc-server";
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const seats = ["N", "E", "S", "W"] as const;
const bearerPattern = /^Bearer\s+/i;

function secret(env: Env, name: string): string | undefined {
	const value = Reflect.get(env, name);
	return typeof value === "string" ? value : undefined;
}

function runtime(env: Env) {
	const authSecret = secret(env, "BETTER_AUTH_SECRET");
	if (!authSecret) {
		throw new Error("BETTER_AUTH_SECRET is not configured");
	}
	return createServerEnv({
		...env,
		BETTER_AUTH_SECRET: authSecret,
		BOOTSTRAP_TOKEN: secret(env, "BOOTSTRAP_TOKEN"),
	});
}

function authFor(env: Env, allowSignUp = false) {
	const bindings = runtime(env);
	return createAuth(createDb(env.DB), {
		allowSignUp,
		baseURL: bindings.BETTER_AUTH_URL,
		corsOrigin: bindings.CORS_ORIGIN,
		previewAutoLogin: secret(env, "PREVIEW_AUTO_LOGIN") === "true",
		secret: bindings.BETTER_AUTH_SECRET,
	});
}

async function hasRegisteredUser(env: Env): Promise<boolean> {
	const db = createDb(env.DB);
	const [{ count = 0 } = {}] = await db
		.select({ count: sql<number>`count(*)` })
		.from(user);
	return Number(count) > 0;
}

async function sha256(value: ArrayBuffer | string): Promise<string> {
	const bytes =
		typeof value === "string" ? new TextEncoder().encode(value) : value;
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

const app = new Hono<{ Bindings: Env }>();

app.use("/*", (context, next) =>
	cors({
		origin: context.env.CORS_ORIGIN,
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
		credentials: true,
	})(context, next)
);

app.get("/api/registration-status", async (context) =>
	context.json({ available: !(await hasRegisteredUser(context.env)) })
);

app.post("/api/auth/sign-up/email", async (context) => {
	if (await hasRegisteredUser(context.env)) {
		return context.json(
			{
				error: "REGISTRATION_CLOSED",
				message: "このポータルの管理者アカウントは登録済みです。",
			},
			409
		);
	}
	return authFor(context.env, true).handler(context.req.raw);
});

app.on(["GET", "POST"], "/api/auth/*", (context) =>
	authFor(context.env).handler(context.req.raw)
);

app.get("/api/preview/access", (context) => {
	if (secret(context.env, "PREVIEW_AUTO_LOGIN") !== "true") {
		return context.json({ error: "NOT_FOUND" }, 404);
	}
	const returnTo = context.req.query("returnTo");
	if (!returnTo) {
		return context.json({ error: "INVALID_RETURN_URL" }, 400);
	}
	try {
		const url = new URL(returnTo);
		if (url.origin !== context.env.CORS_ORIGIN) {
			return context.json({ error: "INVALID_RETURN_URL" }, 400);
		}
		url.searchParams.set("previewApiAccess", "1");
		return context.redirect(url.toString(), 302);
	} catch {
		return context.json({ error: "INVALID_RETURN_URL" }, 400);
	}
});

app.post("/api/bootstrap", async (context) => {
	const token = secret(context.env, "BOOTSTRAP_TOKEN");
	const supplied = context.req
		.header("Authorization")
		?.replace(bearerPattern, "");
	if (
		!(
			token &&
			supplied &&
			constantTimeEqual(
				new TextEncoder().encode(token),
				new TextEncoder().encode(supplied)
			)
		)
	) {
		return context.json({ error: "NOT_FOUND" }, 404);
	}
	const db = createDb(context.env.DB);
	if (await hasRegisteredUser(context.env)) {
		return context.json({ error: "ALREADY_BOOTSTRAPPED" }, 409);
	}
	const body = await context.req.json<{
		email?: string;
		funbridgeId?: string;
		name?: string;
		password?: string;
	}>();
	if (
		!(body.email && body.name && body.password) ||
		body.password.length < 12
	) {
		return context.json(
			{
				error: "INVALID_ACCOUNT",
				message: "email、name、12文字以上のpasswordが必要です。",
			},
			400
		);
	}
	const created = await authFor(context.env, true).api.signUpEmail({
		body: { email: body.email, name: body.name, password: body.password },
	});
	if (body.funbridgeId && created.user?.id) {
		await db
			.update(user)
			.set({ funbridgeId: body.funbridgeId })
			.where(eq(user.id, created.user.id));
	}
	return context.json({ user: created.user }, 201);
});

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Import is an ordered persistence pipeline; keeping it together makes partial-state handling auditable.
app.post("/api/imports/funbridge-json", async (context) => {
	const auth = authFor(context.env);
	const session = await auth.api.getSession({
		headers: context.req.raw.headers,
	});
	if (!session) {
		return context.json({ error: "UNAUTHORIZED" }, 401);
	}
	const form = await context.req.formData();
	const file = form.get("file");
	if (
		!(file instanceof File) ||
		file.size === 0 ||
		file.size > MAX_IMPORT_BYTES
	) {
		return context.json(
			{ error: "INVALID_FILE", maxBytes: MAX_IMPORT_BYTES },
			400
		);
	}
	const bytes = await file.arrayBuffer();
	const hash = await sha256(bytes);
	const db = createDb(context.env.DB);
	const duplicate = await db.query.importRevision.findFirst({
		where: and(
			eq(importRevision.userId, session.user.id),
			eq(importRevision.sha256, hash)
		),
	});
	if (duplicate) {
		return context.json({
			duplicate: true,
			importRevisionId: duplicate.id,
			tournamentId: duplicate.tournamentId,
		});
	}

	let parsed: ReturnType<typeof parseFunbridgeJson>;
	try {
		parsed = parseFunbridgeJson(new TextDecoder().decode(bytes));
	} catch (error) {
		return context.json(
			{
				error: "INVALID_FUNBRIDGE_JSON",
				message: error instanceof Error ? error.message : "Invalid JSON",
			},
			400
		);
	}
	if (parsed.kind === "HISTORY_INDEX") {
		const importId = crypto.randomUUID();
		const indexId = crypto.randomUUID();
		const r2Key = `${session.user.id}/history-index/${parsed.family}/${hash}.json`;
		try {
			await context.env.RAW_IMPORTS.put(r2Key, bytes, {
				httpMetadata: { contentType: "application/json" },
				customMetadata: { sha256: hash, source: "funbridge-history-index" },
			});
			await db.insert(importRevision).values({
				id: importId,
				userId: session.user.id,
				sha256: hash,
				r2Key,
				status: "PENDING",
				warnings: [],
			});
			await db.insert(historyIndex).values({
				id: indexId,
				importRevisionId: importId,
				userId: session.user.id,
				family: parsed.family,
				capturedAt: parsed.capturedAt,
				captureMode: parsed.captureMode,
				locale: parsed.locale,
				coverage: parsed.coverage,
			});
			if (parsed.tournaments.length) {
				await db.insert(historyIndexEntry).values(
					parsed.tournaments.map((entry) => ({
						id: crypto.randomUUID(),
						historyIndexId: indexId,
						sourceTournamentId: entry.sourceTournamentId,
						title: entry.title,
						playedAt:
							(entry.startDate ?? entry.lastPlayedAt)
								? new Date(entry.startDate ?? entry.lastPlayedAt ?? "")
								: null,
						registeredPlayerCount: entry.registeredPlayerCount,
						inProgress: entry.inProgress,
						rank: entry.rank ?? null,
						score: entry.score ?? null,
						scoreType: entry.scoreType ?? null,
						boardCount: entry.boardCount ?? null,
						playedBoardCount: entry.playedBoardCount ?? null,
						metadata: entry,
					}))
				);
			}
			await db
				.update(importRevision)
				.set({ status: "ACTIVE" })
				.where(eq(importRevision.id, importId));
			return context.json(
				{
					duplicate: false,
					importRevisionId: importId,
					kind: "HISTORY_INDEX",
					rowCount: parsed.tournaments.length,
				},
				201
			);
		} catch (error) {
			await db.delete(historyIndex).where(eq(historyIndex.id, indexId));
			await db.delete(importRevision).where(eq(importRevision.id, importId));
			await context.env.RAW_IMPORTS.delete(r2Key);
			throw error;
		}
	}
	const family = parsed.family;
	const externalId = parsed.externalId;
	const current = await db.query.tournament.findFirst({
		where: and(
			eq(tournament.userId, session.user.id),
			eq(tournament.family, family),
			eq(tournament.externalId, externalId)
		),
	});
	const createdTournament = !current;
	const tournamentId = current?.id ?? crypto.randomUUID();
	const previous = current
		? await db.query.tournamentRevision.findFirst({
				where: eq(tournamentRevision.tournamentId, tournamentId),
				orderBy: desc(tournamentRevision.revisionNumber),
			})
		: undefined;
	const revisionNumber = (previous?.revisionNumber ?? 0) + 1;
	const importId = crypto.randomUUID();
	const revisionId = crypto.randomUUID();
	const externalIdKey = await sha256(externalId);
	const r2Key = `${session.user.id}/${family}/${externalIdKey}/${revisionNumber}-${hash}.json`;
	const warnings = [...parsed.warnings];
	const confirmedHeroSeat = form.get("heroSeat")?.toString();
	if (
		confirmedHeroSeat &&
		!seats.includes(confirmedHeroSeat as (typeof seats)[number])
	) {
		return context.json({ error: "INVALID_HERO_SEAT" }, 400);
	}
	if (parsed.boards.some((board) => !(board.heroSeat || confirmedHeroSeat))) {
		warnings.push("HERO_SEAT_CONFIRMATION_REQUIRED");
	}
	try {
		if (createdTournament) {
			await db.insert(tournament).values({
				id: tournamentId,
				userId: session.user.id,
				externalId,
				family,
				name: parsed.name,
			});
		}
		await context.env.RAW_IMPORTS.put(r2Key, bytes, {
			httpMetadata: { contentType: "application/json" },
			customMetadata: { sha256: hash, source: "funbridge" },
		});
		await db.insert(importRevision).values({
			id: importId,
			userId: session.user.id,
			tournamentId,
			sha256: hash,
			r2Key,
			status: "PENDING",
			warnings: [...new Set(warnings)],
		});
		await db.insert(tournamentRevision).values({
			id: revisionId,
			tournamentId,
			importRevisionId: importId,
			revisionNumber,
			playedAt: parsed.playedAt,
			completion: parsed.completion,
			boardCount: parsed.declaredBoardCount,
			scoreType: parsed.scoreType,
			tournamentScore: parsed.score ?? null,
			rank: parsed.rank ?? null,
			participantCount: parsed.participantCount ?? null,
			familyMetadata: parsed.familyMetadata,
		});

		for (const game of parsed.boards) {
			const bridgeDeal = game.deal;
			const pbnDeal = dealToPbn(bridgeDeal);
			const dealHash = await sha256(
				`${bridgeDeal.dealer}|${bridgeDeal.vulnerability}|${pbnDeal}`
			);
			let storedDeal = await db.query.deal.findFirst({
				where: eq(deal.dealHash, dealHash),
			});
			if (!storedDeal) {
				await db
					.insert(deal)
					.values({
						id: crypto.randomUUID(),
						dealHash,
						dealer: bridgeDeal.dealer,
						vulnerability: bridgeDeal.vulnerability,
						pbnDeal,
					})
					.onConflictDoNothing();
				storedDeal = await db.query.deal.findFirst({
					where: eq(deal.dealHash, dealHash),
				});
			}
			if (!storedDeal) {
				throw new Error("DEAL_PERSISTENCE_FAILED");
			}
			const boardId = crypto.randomUUID();
			const heroSeat =
				game.heroSeat ??
				(seats.includes(confirmedHeroSeat as Seat)
					? (confirmedHeroSeat as Seat)
					: undefined);
			await db.insert(boardAttempt).values({
				id: boardId,
				tournamentRevisionId: revisionId,
				dealId: storedDeal.id,
				boardNumber: bridgeDeal.boardNumber,
				heroSeat,
				contract: bridgeDeal.contract,
				declarer: bridgeDeal.declarer,
				historyMetadata: {
					comparison: game.comparison,
					source: game.source,
				},
				result: bridgeDeal.result,
				sourceStatus: game.status ?? null,
			});
			if (game.auction?.length) {
				await db.insert(auctionCall).values(
					game.auction.map((call) => ({
						id: crypto.randomUUID(),
						boardAttemptId: boardId,
						callIndex: call.index,
						seat: call.seat,
						call: call.call,
						alert: call.alert,
					}))
				);
			}
			if (game.play?.length) {
				await db.insert(playAction).values(
					game.play.map((action) => ({
						id: crypto.randomUUID(),
						boardAttemptId: boardId,
						actionIndex: action.index,
						trickNumber: action.trickNumber,
						seat: action.seat,
						card: action.card,
					}))
				);
			}
			await db.insert(boardScore).values({
				id: crypto.randomUUID(),
				boardAttemptId: boardId,
				type: parsed.scoreType,
				value: game.score ?? null,
				contractMade:
					bridgeDeal.result === undefined ? null : bridgeDeal.result >= 0,
			});
		}
		await db
			.update(tournament)
			.set({
				activeRevisionId: revisionId,
				name: parsed.name,
				updatedAt: new Date(),
			})
			.where(eq(tournament.id, tournamentId));
		await db
			.update(importRevision)
			.set({ status: "ACTIVE" })
			.where(eq(importRevision.id, importId));
		return context.json(
			{
				duplicate: false,
				importRevisionId: importId,
				tournamentId,
				revisionNumber,
				warnings: [...new Set(warnings)],
			},
			201
		);
	} catch (error) {
		await db
			.delete(tournamentRevision)
			.where(eq(tournamentRevision.id, revisionId));
		await db.delete(importRevision).where(eq(importRevision.id, importId));
		if (createdTournament) {
			await db.delete(tournament).where(eq(tournament.id, tournamentId));
		}
		await context.env.RAW_IMPORTS.delete(r2Key);
		throw error;
	}
});

app.get("/api/boards/:id/export.pbn", async (context) => {
	const auth = authFor(context.env);
	const session = await auth.api.getSession({
		headers: context.req.raw.headers,
	});
	if (!session) {
		return context.json({ error: "UNAUTHORIZED" }, 401);
	}
	const db = createDb(context.env.DB);
	const board = await db.query.boardAttempt.findFirst({
		where: eq(boardAttempt.id, context.req.param("id")),
		with: {
			auctionCalls: true,
			deal: true,
			playActions: true,
			score: true,
			tournamentRevision: { with: { tournament: true } },
		},
	});
	if (board?.tournamentRevision.tournament.userId !== session.user.id) {
		return context.json({ error: "NOT_FOUND" }, 404);
	}
	const tournamentItem = board.tournamentRevision.tournament;
	const doubleDummy = await db.query.doubleDummyResult.findFirst({
		where: eq(doubleDummyResult.boardAttemptId, board.id),
		orderBy: [desc(doubleDummyResult.createdAt), desc(sql`rowid`)],
	});
	const nameTags = { North: "?", East: "?", South: "?", West: "?" };
	const orderedAuction = [...board.auctionCalls].sort(
		(left, right) => left.callIndex - right.callIndex
	);
	const orderedPlay = [...board.playActions].sort(
		(left, right) => left.actionIndex - right.actionIndex
	);
	const familyTags = Object.fromEntries(
		Object.entries(board.tournamentRevision.familyMetadata ?? {}).map(
			([key, value]) => [
				`Funbridge${key.charAt(0).toUpperCase()}${key.slice(1)}`,
				value == null ? "?" : String(value),
			]
		)
	);
	const game: PbnGame = {
		auction: orderedAuction.map((call) => ({
			alert: call.alert ?? undefined,
			call: call.call,
			index: call.callIndex,
			seat: call.seat,
		})),
		incompleteAuction: orderedAuction.length === 0,
		incompletePlay: orderedPlay.length < 52,
		play: orderedPlay.map((action) => ({
			card: action.card,
			index: action.actionIndex,
			seat: action.seat,
			trickNumber: action.trickNumber,
		})),
		tags: {
			Event: tournamentItem.name,
			Site: "Funbridge",
			Date:
				board.tournamentRevision.playedAt
					?.toISOString()
					.slice(0, 10)
					.replaceAll("-", ".") ?? "?",
			Board: String(board.boardNumber),
			...nameTags,
			Dealer: board.deal.dealer,
			Vulnerable: board.deal.vulnerability,
			Deal: board.deal.pbnDeal,
			Scoring: board.score?.type ?? board.tournamentRevision.scoreType,
			Declarer: board.declarer ?? "?",
			Contract: board.contract ?? "?",
			Result: contractResultToTricks(board.contract, board.result),
			FunbridgeTournamentId: tournamentItem.externalId,
			FunbridgeTournamentFamily: tournamentItem.family,
			FunbridgePlayedAt:
				board.tournamentRevision.playedAt?.toISOString() ?? "?",
			FunbridgeCompletion: board.tournamentRevision.completion,
			FunbridgeBoardCount: String(board.tournamentRevision.boardCount),
			FunbridgeTournamentScore:
				board.tournamentRevision.tournamentScore === null
					? "?"
					: String(board.tournamentRevision.tournamentScore),
			FunbridgeRank:
				board.tournamentRevision.rank === null
					? "?"
					: String(board.tournamentRevision.rank),
			FunbridgeParticipantCount:
				board.tournamentRevision.participantCount === null
					? "?"
					: String(board.tournamentRevision.participantCount),
			...familyTags,
			Play: orderedPlay[0]?.seat ?? "?",
			...(doubleDummy ? createDoubleDummyPbnTags(doubleDummy) : {}),
		},
		warnings: [],
	};
	return context.body(exportPbn([game]), 200, {
		"Content-Disposition": `attachment; filename="board-${board.boardNumber}.pbn"`,
		"Content-Type": "application/x-pbn; charset=utf-8",
	});
});

app.use("/trpc/*", (context, next) => {
	const auth = authFor(context.env);
	const db = createDb(context.env.DB);
	return trpcServer({
		router: appRouter,
		createContext: createContextFactory(db, async () =>
			context.req.header("Cookie")
				? auth.api.getSession({ headers: context.req.raw.headers })
				: null
		),
	})(context, next);
});

app.get("/", (context) => context.text("OK"));

app.onError((error, context) => {
	console.error(
		JSON.stringify({
			error: error.message,
			message: "Unhandled Worker request error",
			method: context.req.method,
			path: context.req.path,
		})
	);
	return context.json({ error: "INTERNAL_SERVER_ERROR" }, 500);
});

export { app };
export default app;
