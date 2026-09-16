import { createContextFactory } from "@bridge-portal/api/context";
import { appRouter } from "@bridge-portal/api/routers/index";
import { constantTimeEqual, createAuth } from "@bridge-portal/auth";
import {
	apiToken,
	auctionCall,
	boardAttempt,
	boardScore,
	createDb,
	deal,
	deviceAuthorization,
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
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const IMPORT_TOKEN_LIFETIME_MS = 12 * 60 * 60 * 1000;
const DEVICE_AUTHORIZATION_LIFETIME_MS = 10 * 60 * 1000;
const DEVICE_AUTHORIZATION_INTERVAL_SECONDS = 2;
const historyImportContentType = "application/json";
const seats = ["N", "E", "S", "W"] as const;
const bearerPattern = /^Bearer\s+/i;
const userCodePattern = /^[A-Z2-9]{8}$/;

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

function randomToken(): string {
	return `bpih_${[...crypto.getRandomValues(new Uint8Array(32))]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("")}`;
}

function randomUserCode(): string {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	return [...crypto.getRandomValues(new Uint8Array(8))]
		.map((byte) => alphabet[byte % alphabet.length])
		.join("");
}

function normalizedUserCode(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}
	const code = value.replaceAll("-", "").trim().toUpperCase();
	return userCodePattern.test(code) ? code : undefined;
}

interface ImportResponse {
	body: Record<string, unknown>;
	status: 200 | 201 | 400;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Import persistence and its compensating cleanup must remain adjacent for auditability.
async function importFunbridgeJson(data: {
	bytes: ArrayBuffer;
	env: Env;
	heroSeat?: string;
	userId: string;
}): Promise<ImportResponse> {
	const hash = await sha256(data.bytes);
	let parsed: ReturnType<typeof parseFunbridgeJson>;
	try {
		parsed = parseFunbridgeJson(new TextDecoder().decode(data.bytes));
	} catch (error) {
		return {
			body: {
				error: "INVALID_FUNBRIDGE_JSON",
				message: error instanceof Error ? error.message : "Invalid JSON",
			},
			status: 400,
		};
	}
	const db = createDb(data.env.DB);
	const duplicate = await db.query.importRevision.findFirst({
		where: and(
			eq(importRevision.userId, data.userId),
			eq(importRevision.sha256, hash)
		),
	});
	if (duplicate) {
		return {
			body: {
				duplicate: true,
				importRevisionId: duplicate.id,
				tournamentId: duplicate.tournamentId,
			},
			status: 200,
		};
	}

	if (parsed.kind === "HISTORY_INDEX") {
		const importId = crypto.randomUUID();
		const indexId = crypto.randomUUID();
		const r2Key = `${data.userId}/history-index/${parsed.family}/${hash}.json`;
		try {
			await data.env.RAW_IMPORTS.put(r2Key, data.bytes, {
				httpMetadata: { contentType: historyImportContentType },
				customMetadata: { sha256: hash, source: "funbridge-history-index" },
			});
			await db.insert(importRevision).values({
				id: importId,
				userId: data.userId,
				sha256: hash,
				r2Key,
				status: "PENDING",
				warnings: [],
			});
			await db.insert(historyIndex).values({
				id: indexId,
				importRevisionId: importId,
				userId: data.userId,
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
			return {
				body: {
					duplicate: false,
					importRevisionId: importId,
					kind: "HISTORY_INDEX",
					rowCount: parsed.tournaments.length,
				},
				status: 201,
			};
		} catch (error) {
			await db.delete(historyIndex).where(eq(historyIndex.id, indexId));
			await db.delete(importRevision).where(eq(importRevision.id, importId));
			await data.env.RAW_IMPORTS.delete(r2Key);
			throw error;
		}
	}
	const family = parsed.family;
	const externalId = parsed.externalId;
	const current = await db.query.tournament.findFirst({
		where: and(
			eq(tournament.userId, data.userId),
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
	const r2Key = `${data.userId}/${family}/${externalIdKey}/${revisionNumber}-${hash}.json`;
	const warnings = [...parsed.warnings];
	if (
		data.heroSeat &&
		!seats.includes(data.heroSeat as (typeof seats)[number])
	) {
		return { body: { error: "INVALID_HERO_SEAT" }, status: 400 };
	}
	if (parsed.boards.some((board) => !(board.heroSeat || data.heroSeat))) {
		warnings.push("HERO_SEAT_CONFIRMATION_REQUIRED");
	}
	try {
		if (createdTournament) {
			await db.insert(tournament).values({
				id: tournamentId,
				userId: data.userId,
				externalId,
				family,
				name: parsed.name,
			});
		}
		await data.env.RAW_IMPORTS.put(r2Key, data.bytes, {
			httpMetadata: { contentType: historyImportContentType },
			customMetadata: { sha256: hash, source: "funbridge" },
		});
		await db.insert(importRevision).values({
			id: importId,
			userId: data.userId,
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
				(seats.includes(data.heroSeat as Seat)
					? (data.heroSeat as Seat)
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
		return {
			body: {
				duplicate: false,
				importRevisionId: importId,
				tournamentId,
				revisionNumber,
				warnings: [...new Set(warnings)],
			},
			status: 201,
		};
	} catch (error) {
		await db
			.delete(tournamentRevision)
			.where(eq(tournamentRevision.id, revisionId));
		await db.delete(importRevision).where(eq(importRevision.id, importId));
		if (createdTournament) {
			await db.delete(tournament).where(eq(tournament.id, tournamentId));
		}
		await data.env.RAW_IMPORTS.delete(r2Key);
		throw error;
	}
}

async function importApiUserId(
	env: Env,
	authorization: string | undefined
): Promise<string | undefined> {
	const supplied = authorization?.replace(bearerPattern, "");
	if (!supplied || supplied === authorization) {
		return undefined;
	}
	const token = await createDb(env.DB).query.apiToken.findFirst({
		where: and(
			eq(apiToken.tokenHash, await sha256(supplied)),
			gt(apiToken.expiresAt, new Date())
		),
	});
	return token?.userId;
}

const app = new Hono<{ Bindings: Env }>();

app.use("/*", (context, next) =>
	cors({
		origin: context.env.CORS_ORIGIN,
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: [
			"Content-Type",
			"Authorization",
			"X-Bridge-Portal-Hero-Seat",
		],
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

app.post("/api/v1/imports/funbridge-json", async (context) => {
	const userId = await importApiUserId(
		context.env,
		context.req.header("Authorization")
	);
	if (!userId) {
		return context.json({ error: "UNAUTHORIZED" }, 401);
	}
	if (
		context.req
			.header("Content-Type")
			?.split(";", 1)[0]
			?.trim()
			.toLowerCase() !== historyImportContentType
	) {
		return context.json(
			{
				error: "UNSUPPORTED_MEDIA_TYPE",
				message: `Content-Type must be ${historyImportContentType}.`,
			},
			415
		);
	}
	const bytes = await context.req.raw.arrayBuffer();
	if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMPORT_BYTES) {
		return context.json(
			{ error: "INVALID_FILE", maxBytes: MAX_IMPORT_BYTES },
			400
		);
	}
	const result = await importFunbridgeJson({
		bytes,
		env: context.env,
		heroSeat: context.req.header("X-Bridge-Portal-Hero-Seat") ?? undefined,
		userId,
	});
	return context.json(result.body, result.status);
});

app.post("/api/v1/import-tokens", async (context) => {
	const auth = authFor(context.env);
	const session = await auth.api.getSession({
		headers: context.req.raw.headers,
	});
	if (!session) {
		return context.json({ error: "UNAUTHORIZED" }, 401);
	}
	const body = await context.req
		.json<{ label?: unknown }>()
		.catch((): { label?: unknown } => ({}));
	const label =
		typeof body.label === "string" ? body.label.trim() : "History import";
	if (!label || label.length > 100) {
		return context.json({ error: "INVALID_TOKEN_LABEL" }, 400);
	}
	const accessToken = randomToken();
	const expiresAt = new Date(Date.now() + IMPORT_TOKEN_LIFETIME_MS);
	await createDb(context.env.DB)
		.insert(apiToken)
		.values({
			id: crypto.randomUUID(),
			userId: session.user.id,
			label,
			tokenHash: await sha256(accessToken),
			expiresAt,
		});
	return context.json({ accessToken, expiresAt: expiresAt.toISOString() }, 201);
});

app.post("/api/v1/device-authorizations", async (context) => {
	const deviceCode = randomToken();
	const userCode = randomUserCode();
	const expiresAt = new Date(Date.now() + DEVICE_AUTHORIZATION_LIFETIME_MS);
	await createDb(context.env.DB)
		.insert(deviceAuthorization)
		.values({
			id: crypto.randomUUID(),
			deviceCodeHash: await sha256(deviceCode),
			userCodeHash: await sha256(userCode),
			expiresAt,
		});
	const verificationUrl = new URL(
		"/device-authorizations",
		context.env.CORS_ORIGIN
	);
	verificationUrl.searchParams.set("user_code", userCode);
	return context.json(
		{
			deviceCode,
			expiresIn: DEVICE_AUTHORIZATION_LIFETIME_MS / 1000,
			interval: DEVICE_AUTHORIZATION_INTERVAL_SECONDS,
			userCode,
			verificationUri: `${verificationUrl.origin}${verificationUrl.pathname}`,
			verificationUriComplete: verificationUrl.toString(),
		},
		201
	);
});

app.post("/api/v1/device-authorizations/approve", async (context) => {
	const auth = authFor(context.env);
	const session = await auth.api.getSession({
		headers: context.req.raw.headers,
	});
	if (!session) {
		return context.json({ error: "UNAUTHORIZED" }, 401);
	}
	const body = await context.req
		.json<{ userCode?: unknown }>()
		.catch((): { userCode?: unknown } => ({}));
	const userCode = normalizedUserCode(body.userCode);
	if (!userCode) {
		return context.json({ error: "INVALID_USER_CODE" }, 400);
	}
	const db = createDb(context.env.DB);
	const authorization = await db.query.deviceAuthorization.findFirst({
		where: and(
			eq(deviceAuthorization.userCodeHash, await sha256(userCode)),
			gt(deviceAuthorization.expiresAt, new Date())
		),
	});
	if (!authorization) {
		return context.json({ error: "DEVICE_AUTHORIZATION_EXPIRED" }, 410);
	}
	if (authorization.status !== "PENDING") {
		return context.json({ error: "DEVICE_AUTHORIZATION_ALREADY_USED" }, 409);
	}
	await db.insert(apiToken).values({
		id: crypto.randomUUID(),
		userId: session.user.id,
		label: "Browser device authorization",
		tokenHash: authorization.deviceCodeHash,
		expiresAt: new Date(Date.now() + IMPORT_TOKEN_LIFETIME_MS),
	});
	await db
		.update(deviceAuthorization)
		.set({ status: "AUTHORIZED", userId: session.user.id })
		.where(eq(deviceAuthorization.id, authorization.id));
	return context.json({ approved: true });
});

app.post("/api/v1/device-authorizations/token", async (context) => {
	const body = await context.req
		.json<{ deviceCode?: unknown }>()
		.catch((): { deviceCode?: unknown } => ({}));
	if (!(typeof body.deviceCode === "string" && body.deviceCode.trim())) {
		return context.json({ error: "INVALID_DEVICE_CODE" }, 400);
	}
	const db = createDb(context.env.DB);
	const authorization = await db.query.deviceAuthorization.findFirst({
		where: and(
			eq(deviceAuthorization.deviceCodeHash, await sha256(body.deviceCode)),
			gt(deviceAuthorization.expiresAt, new Date())
		),
	});
	if (!authorization) {
		return context.json({ error: "DEVICE_AUTHORIZATION_EXPIRED" }, 410);
	}
	if (authorization.status === "PENDING") {
		return context.json({ error: "AUTHORIZATION_PENDING" }, 428);
	}
	if (authorization.status === "CONSUMED") {
		return context.json({ error: "DEVICE_AUTHORIZATION_CONSUMED" }, 409);
	}
	await db
		.update(deviceAuthorization)
		.set({ status: "CONSUMED" })
		.where(eq(deviceAuthorization.id, authorization.id));
	return context.json({
		accessToken: body.deviceCode,
		expiresIn: IMPORT_TOKEN_LIFETIME_MS / 1000,
		tokenType: "Bearer",
	});
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
