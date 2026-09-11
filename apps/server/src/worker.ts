import { createContextFactory } from "@bridge-portal/api/context";
import { appRouter } from "@bridge-portal/api/routers/index";
import { constantTimeEqual, createAuth } from "@bridge-portal/auth";
import {
	auctionCall,
	boardAttempt,
	boardScore,
	createDb,
	deal,
	evaluationRun,
	importRevision,
	playAction,
	ruleEvaluation,
	systemVersion,
	tournament,
	tournamentRevision,
	user,
} from "@bridge-portal/db";
import {
	type BridgeDeal,
	evaluateBoard,
	exportPbn,
	JCBL_RULESET_VERSION,
	type PbnGame,
	parsePbn,
	RULE_ENGINE_VERSION,
	type Seat,
	type SystemSnapshot,
	tournamentFamilies,
} from "@bridge-portal/domain";
import { createServerEnv } from "@bridge-portal/env/server";
import { trpcServer } from "@hono/trpc-server";
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";

const MAX_PBN_BYTES = 10 * 1024 * 1024;
const seats = ["N", "E", "S", "W"] as const;
const dealPattern = /^(N|E|S|W):(.+)$/i;
const whitespacePattern = /\s+/;
const integerPattern = /^-?\d+$/;
const bearerPattern = /^Bearer\s+/i;
const seatTagNames = { N: "North", E: "East", S: "South", W: "West" } as const;

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
		secret: bindings.BETTER_AUTH_SECRET,
	});
}

async function sha256(value: ArrayBuffer | string): Promise<string> {
	const bytes =
		typeof value === "string" ? new TextEncoder().encode(value) : value;
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

function parseDate(value?: string): Date | undefined {
	if (!value || value === "?") {
		return;
	}
	const parsed = new Date(value.replaceAll(".", "-").replace(" ", "T"));
	return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function vulnerability(value?: string): BridgeDeal["vulnerability"] {
	const normalized = value?.toUpperCase();
	if (normalized === "NS" || normalized === "EW") {
		return normalized;
	}
	if (normalized === "ALL" || normalized === "BOTH") {
		return "Both";
	}
	return "None";
}

function readDeal(tags: Record<string, string>): BridgeDeal | undefined {
	const match = dealPattern.exec(tags.Deal ?? "");
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
		const seat = seats[(seats.indexOf(first) + index) % 4];
		if (seat) {
			hands[seat] = values[index] ?? "";
		}
	}
	return {
		boardNumber: Number.parseInt(tags.Board ?? "0", 10) || 0,
		contract: tags.Contract === "?" ? undefined : tags.Contract,
		dealer: seats.includes(tags.Dealer as Seat) ? (tags.Dealer as Seat) : first,
		declarer: seats.includes(tags.Declarer as Seat)
			? (tags.Declarer as Seat)
			: undefined,
		hands,
		result: integerPattern.test(tags.Result ?? "")
			? Number(tags.Result)
			: undefined,
		vulnerability: vulnerability(tags.Vulnerable),
	};
}

function resolveHeroSeat(
	tags: Record<string, string>,
	confirmed?: string
): Seat | undefined {
	if (seats.includes(confirmed as Seat)) {
		return confirmed as Seat;
	}
	const playerId = tags.FunbridgePlayerId;
	if (!playerId) {
		return;
	}
	const matches = seats.filter(
		(seat) =>
			tags[{ N: "North", E: "East", S: "South", W: "West" }[seat]] === playerId
	);
	return matches.length === 1 ? matches[0] : undefined;
}

function familyMetadata(
	tags: Record<string, string>
): Record<string, string | number | null> {
	const keys = [
		"FunbridgeBpLevel",
		"FunbridgeMultiplier",
		"FunbridgeBpAwarded",
		"FunbridgeEventType",
		"FunbridgeRegion",
		"FunbridgeSeriesLevel",
		"FunbridgeSeriesPeriod",
		"FunbridgeSeriesOutcome",
	];
	return Object.fromEntries(
		keys
			.filter((key) => tags[key] !== undefined)
			.map((key) => [key, tags[key] ?? null])
	);
}

function readScoreType(tags: Record<string, string>): "MP" | "IMP" {
	const value = (tags.FunbridgeScoreType ?? tags.Scoring ?? "").toUpperCase();
	return value.includes("IMP") ? "IMP" : "MP";
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

app.on(["GET", "POST"], "/api/auth/*", (context) =>
	authFor(context.env).handler(context.req.raw)
);

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
	const [{ count = 0 } = {}] = await db
		.select({ count: sql<number>`count(*)` })
		.from(user);
	if (Number(count) > 0) {
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
app.post("/api/imports/pbn", async (context) => {
	const auth = authFor(context.env);
	const session = await auth.api.getSession({
		headers: context.req.raw.headers,
	});
	if (!session) {
		return context.json({ error: "UNAUTHORIZED" }, 401);
	}
	const form = await context.req.formData();
	const file = form.get("file");
	if (!(file instanceof File) || file.size === 0 || file.size > MAX_PBN_BYTES) {
		return context.json(
			{ error: "INVALID_FILE", maxBytes: MAX_PBN_BYTES },
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

	const parsed = parsePbn(new TextDecoder().decode(bytes));
	const first = parsed.games[0];
	if (!first) {
		return context.json({ error: "NO_PBN_GAMES" }, 400);
	}
	const family = first.tags.FunbridgeTournamentFamily;
	if (
		!tournamentFamilies.includes(family as (typeof tournamentFamilies)[number])
	) {
		return context.json(
			{ error: "INVALID_TOURNAMENT_FAMILY", accepted: tournamentFamilies },
			400
		);
	}
	const externalId = first.tags.FunbridgeTournamentId;
	if (!externalId) {
		return context.json({ error: "MISSING_FunbridgeTournamentId" }, 400);
	}

	let current = await db.query.tournament.findFirst({
		where: and(
			eq(tournament.userId, session.user.id),
			eq(tournament.family, family as (typeof tournamentFamilies)[number]),
			eq(tournament.externalId, externalId)
		),
	});
	const createdTournament = !current;
	const tournamentId = current?.id ?? crypto.randomUUID();
	if (!current) {
		await db.insert(tournament).values({
			id: tournamentId,
			userId: session.user.id,
			externalId,
			family: family as (typeof tournamentFamilies)[number],
			name: first.tags.Event || `Funbridge ${externalId}`,
		});
		current = await db.query.tournament.findFirst({
			where: eq(tournament.id, tournamentId),
		});
	}
	const previous = await db.query.tournamentRevision.findFirst({
		where: eq(tournamentRevision.tournamentId, tournamentId),
		orderBy: desc(tournamentRevision.revisionNumber),
	});
	const revisionNumber = (previous?.revisionNumber ?? 0) + 1;
	const importId = crypto.randomUUID();
	const revisionId = crypto.randomUUID();
	const r2Key = `${session.user.id}/${family}/${externalId}/${revisionNumber}-${hash}.pbn`;
	await context.env.RAW_IMPORTS.put(r2Key, bytes, {
		httpMetadata: { contentType: "application/x-pbn" },
		customMetadata: { sha256: hash },
	});
	const warnings = [...parsed.warnings];
	const confirmedHeroSeat = form.get("heroSeat")?.toString();
	if (
		parsed.games.some((game) => !resolveHeroSeat(game.tags, confirmedHeroSeat))
	) {
		warnings.push("HERO_SEAT_CONFIRMATION_REQUIRED");
	}
	try {
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
			playedAt: parseDate(first.tags.FunbridgePlayedAt),
			completion: first.tags.FunbridgeCompletion || "UNKNOWN",
			boardCount: parsed.games.length,
			scoreType: readScoreType(first.tags),
			tournamentScore: Number.isFinite(
				Number(first.tags.FunbridgeTournamentScore)
			)
				? Number(first.tags.FunbridgeTournamentScore)
				: null,
			rank: Number.isFinite(Number(first.tags.FunbridgeRank))
				? Number(first.tags.FunbridgeRank)
				: null,
			participantCount: Number.isFinite(
				Number(first.tags.FunbridgeParticipantCount)
			)
				? Number(first.tags.FunbridgeParticipantCount)
				: null,
			familyMetadata: familyMetadata(first.tags),
		});

		const assignedVersion = current?.defaultSystemVersionId
			? await db.query.systemVersion.findFirst({
					where: eq(systemVersion.id, current.defaultSystemVersionId),
				})
			: undefined;
		const system: SystemSnapshot | undefined = assignedVersion
			? {
					name: assignedVersion.name,
					rulesetVersion: assignedVersion.rulesetVersion,
					adoptedOfficialItemIds: assignedVersion.adoptedOfficialItemIds,
					selectedVariants: assignedVersion.selectedVariants,
					settings: assignedVersion.settings,
				}
			: undefined;
		for (const game of parsed.games) {
			const bridgeDeal = readDeal(game.tags);
			if (!bridgeDeal) {
				continue;
			}
			const dealHash = await sha256(game.tags.Deal ?? "");
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
						pbnDeal: game.tags.Deal ?? "",
					})
					.onConflictDoNothing();
				storedDeal = await db.query.deal.findFirst({
					where: eq(deal.dealHash, dealHash),
				});
			}
			if (!storedDeal) {
				continue;
			}
			const boardId = crypto.randomUUID();
			const heroSeat = resolveHeroSeat(game.tags, confirmedHeroSeat);
			await db.insert(boardAttempt).values({
				id: boardId,
				tournamentRevisionId: revisionId,
				dealId: storedDeal.id,
				boardNumber: bridgeDeal.boardNumber,
				heroSeat,
				contract: bridgeDeal.contract,
				declarer: bridgeDeal.declarer,
				result: bridgeDeal.result,
				systemVersionId: assignedVersion?.id,
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
			const scoreType = readScoreType(game.tags);
			const scoreValue = Number(
				game.tags.FunbridgeBoardScore ?? game.tags.Score
			);
			await db.insert(boardScore).values({
				id: crypto.randomUUID(),
				boardAttemptId: boardId,
				type: scoreType,
				value: Number.isFinite(scoreValue) ? scoreValue : null,
				contractMade:
					bridgeDeal.result === undefined ? null : bridgeDeal.result >= 0,
			});
			const runId = crypto.randomUUID();
			await db.insert(evaluationRun).values({
				id: runId,
				boardAttemptId: boardId,
				rulesetVersion: JCBL_RULESET_VERSION,
				ruleEngineVersion: RULE_ENGINE_VERSION,
				systemVersionId: assignedVersion?.id,
				completedAt: new Date(),
			});
			const evaluations = evaluateBoard({
				auction: game.auction,
				deal: bridgeDeal,
				heroSeat,
				playComplete: !game.incompletePlay,
				play: game.play,
				system,
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
		await db
			.update(tournament)
			.set({ activeRevisionId: revisionId, updatedAt: new Date() })
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
			systemVersion: true,
			tournamentRevision: { with: { tournament: true } },
		},
	});
	if (board?.tournamentRevision.tournament.userId !== session.user.id) {
		return context.json({ error: "NOT_FOUND" }, 404);
	}
	const tournamentItem = board.tournamentRevision.tournament;
	const player = await db.query.user.findFirst({
		where: eq(user.id, session.user.id),
	});
	const nameTags = { North: "?", East: "?", South: "?", West: "?" };
	if (board.heroSeat && player?.funbridgeId) {
		nameTags[seatTagNames[board.heroSeat]] = player.funbridgeId;
	}
	const game: PbnGame = {
		auction: board.auctionCalls.map((call) => ({
			alert: call.alert ?? undefined,
			call: call.call,
			index: call.callIndex,
			seat: call.seat,
		})),
		incompleteAuction: board.auctionCalls.length === 0,
		incompletePlay: board.playActions.length < 52,
		play: board.playActions.map((action) => ({
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
			Result: board.result === null ? "?" : String(board.result),
			FunbridgeTournamentId: tournamentItem.externalId,
			FunbridgeTournamentFamily: tournamentItem.family,
			FunbridgePlayerId: player?.funbridgeId ?? "?",
			System: board.systemVersion?.name ?? "?",
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

export { app };
export default app;
