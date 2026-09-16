import { z } from "zod";
import { analyzePlay } from "./play";
import {
	type AuctionCall,
	type BridgeDeal,
	type PlayAction,
	seats,
	type TournamentFamily,
	tournamentFamilies,
} from "./types";

const seatSchema = z.enum(seats);
const familySchema = z.enum(tournamentFamilies);
const scoreTypeSchema = z.enum(["MP", "IMP"]);
const completionSchema = z.enum(["COMPLETED", "IN_PROGRESS", "ABANDONED"]);
const vulnerabilitySchema = z.enum(["None", "NS", "EW", "Both"]);
const handPattern = /^[AKQJT2-9]*\.[AKQJT2-9]*\.[AKQJT2-9]*\.[AKQJT2-9]*$/i;
const cardPattern = /^[SHDC][AKQJT2-9]$/i;
const suits = ["S", "H", "D", "C"] as const;
const handSchema = z
	.string()
	.regex(handPattern)
	.transform((value) => value.toUpperCase());

const auctionCallSchema = z.object({
	alert: z.string().trim().min(1).max(500).optional(),
	call: z.string().trim().min(1).max(32),
	index: z.number().int().min(0),
	seat: seatSchema,
});
const playActionSchema = z.object({
	card: z
		.string()
		.regex(cardPattern)
		.transform((value) => value.toUpperCase()),
	index: z.number().int().min(0),
	seat: seatSchema,
	trickNumber: z.number().int().min(1).max(13),
});
const handsSchema = z.object({
	E: handSchema,
	N: handSchema,
	S: handSchema,
	W: handSchema,
});

const skillTournamentSchema = z
	.object({
		boardCount: z.number().int().min(0),
		bpCircuit: z
			.object({ level: z.string().min(1) })
			.passthrough()
			.optional(),
		completion: completionSchema,
		daily: z
			.object({ region: z.string().min(1) })
			.passthrough()
			.optional(),
		family: familySchema,
		funbridgeId: z.string().min(1),
		id: z.string().min(1),
		name: z.string().min(1),
		participantCount: z.number().int().min(1).optional(),
		playedAt: z.string().datetime({ offset: true }),
		rank: z.number().int().min(1).optional(),
		score: z.number().optional(),
		scoreType: scoreTypeSchema,
		series: z
			.object({
				level: z.string().min(1),
				outcome: z.enum(["PROMOTED", "MAINTAINED", "RELEGATED", "PENDING"]),
				period: z.string().min(1),
			})
			.passthrough()
			.optional(),
	})
	.passthrough()
	.superRefine((value, context) => {
		if (value.family === "BP_CIRCUIT" && !value.bpCircuit) {
			context.addIssue({
				code: "custom",
				message: "BP_CIRCUIT requires tournament.bpCircuit metadata",
			});
		}
		if (value.family === "DAILY" && !value.daily) {
			context.addIssue({
				code: "custom",
				message: "DAILY requires tournament.daily metadata",
			});
		}
		if (value.family === "SERIES" && !value.series) {
			context.addIssue({
				code: "custom",
				message: "SERIES requires tournament.series metadata",
			});
		}
	});
const skillBoardSchema = z
	.object({
		auction: z.array(auctionCallSchema).max(128).optional(),
		boardNumber: z.number().int().min(1),
		comparison: z.object({}).passthrough().optional(),
		contract: z.string().trim().min(1).max(16).optional(),
		dealer: seatSchema,
		declarer: seatSchema.optional(),
		hands: handsSchema,
		heroSeat: seatSchema.optional(),
		play: z.array(playActionSchema).max(52).optional(),
		result: z.number().int().min(-13).max(13).optional(),
		score: z.number().optional(),
		source: z
			.object({ sourceDealId: z.string().min(1) })
			.passthrough()
			.optional(),
		vulnerability: vulnerabilitySchema,
	})
	.passthrough();
const partialBoardSchema = z
	.object({
		auction: z.array(auctionCallSchema).max(128).optional(),
		boardNumber: z.number().int().min(1),
		comparison: z.object({}).passthrough().optional(),
		contract: z.string().trim().min(1).max(16).optional(),
		dealer: seatSchema,
		declarer: seatSchema.optional(),
		hands: handsSchema,
		play: z.array(playActionSchema).max(52).optional(),
		result: z.number().int().min(-13).max(13).optional(),
		score: z.number().optional(),
		source: z.object({ sourceDealId: z.string().min(1) }).passthrough(),
		status: z.enum(["NO_CONTRACT_OR_PLAY", "NO_PLAY", "PASSED_OUT"]),
		vulnerability: vulnerabilitySchema,
	})
	.passthrough();
const skillExportSchema = z
	.object({
		boards: z.array(skillBoardSchema).max(128),
		exportedAt: z.string().datetime({ offset: true }),
		format: z.literal("FUNBRIDGE_EXPORT"),
		formatVersion: z.literal(1),
		partialBoards: z.array(partialBoardSchema).max(128).optional(),
		source: z
			.object({
				capturedAt: z.string().datetime({ offset: true }),
				captureMode: z.enum(["NETWORK_RESPONSE", "MIXED", "SPA_UI"]),
				locale: z.string().min(2),
				platform: z.literal("FUNBRIDGE_WEB"),
				sourceTournamentId: z.string().min(1),
				warnings: z.array(z.string().min(1)).optional(),
			})
			.passthrough(),
		standingsCoverage: z
			.object({
				rowCount: z.number().int().min(0),
				scope: z.enum(["NONE", "VISIBLE_WINDOW", "FULL"]),
				totalCount: z.number().int().min(0),
			})
			.passthrough(),
		tournament: skillTournamentSchema,
	})
	.passthrough();
const historyRowSchema = z
	.object({
		sourceTournamentId: z.string().min(1),
		title: z.string().min(1),
		registeredPlayerCount: z.number().int().min(0),
		inProgress: z.boolean(),
		startDate: z.string().datetime({ offset: true }).optional(),
		lastPlayedAt: z.string().datetime({ offset: true }).optional(),
		rank: z.number().int().min(1).optional(),
		score: z.number().optional(),
		scoreType: scoreTypeSchema.optional(),
		boardCount: z.number().int().min(1).optional(),
		playedBoardCount: z.number().int().min(0).optional(),
	})
	.passthrough();
export const funbridgeHistoryIndexSchema = z
	.object({
		capturedAt: z.string().datetime({ offset: true }),
		coverage: z.object({
			rowCount: z.number().int().min(0),
			scope: z.enum(["NONE", "VISIBLE_WINDOW", "FULL"]),
			totalCount: z.number().int().min(0),
		}),
		family: familySchema,
		format: z.literal("FUNBRIDGE_HISTORY_INDEX"),
		formatVersion: z.literal(1),
		source: z.object({
			captureMode: z.enum(["NETWORK_RESPONSE", "MIXED", "SPA_UI"]),
			locale: z.string().min(2),
			platform: z.literal("FUNBRIDGE_WEB"),
		}),
		tournaments: z.array(historyRowSchema),
	})
	.passthrough();
const legacyExportSchema = z.object({
	boards: z.array(skillBoardSchema).min(1).max(128),
	format: z.literal("FUNBRIDGE_EXPORT"),
	formatVersion: z.literal(1),
	tournament: skillTournamentSchema,
});
export const funbridgeJsonSchema = skillExportSchema.or(legacyExportSchema);
export type FunbridgeJsonFile = z.infer<typeof skillExportSchema>;

export interface NormalizedFunbridgeBoard {
	auction?: AuctionCall[];
	comparison?: Record<string, unknown>;
	deal: BridgeDeal;
	heroSeat?: (typeof seats)[number];
	play?: PlayAction[];
	playComplete: boolean;
	score?: number;
	source?: Record<string, unknown>;
	status?: "NO_CONTRACT_OR_PLAY" | "NO_PLAY" | "PASSED_OUT";
}
export interface NormalizedFunbridgeImport {
	boards: NormalizedFunbridgeBoard[];
	completion: FunbridgeJsonFile["tournament"]["completion"];
	declaredBoardCount: number;
	externalId: string;
	family: TournamentFamily;
	familyMetadata: Record<string, string | number | null>;
	kind: "TOURNAMENT";
	name: string;
	participantCount?: number;
	playedAt: Date;
	rank?: number;
	score?: number;
	scoreType: "MP" | "IMP";
	warnings: string[];
}
export type NormalizedHistoryIndex = Omit<
	Partial<NormalizedFunbridgeImport>,
	"kind"
> & {
	capturedAt: Date;
	coverage: {
		rowCount: number;
		scope: "NONE" | "VISIBLE_WINDOW" | "FULL";
		totalCount: number;
	};
	family: TournamentFamily;
	kind: "HISTORY_INDEX";
	locale: string;
	captureMode: "NETWORK_RESPONSE" | "MIXED" | "SPA_UI";
	tournaments: z.infer<typeof historyRowSchema>[];
};
export type NormalizedFunbridgeFile =
	| NormalizedFunbridgeImport
	| NormalizedHistoryIndex;

function assertDistinctIndexes(
	values: { index: number }[] | undefined,
	path: string
): void {
	if (
		values &&
		new Set(values.map((value) => value.index)).size !== values.length
	) {
		throw new Error(`${path} contains duplicate indexes`);
	}
}
function assertSequentialIndexes(
	values: { index: number }[] | undefined,
	path: string
): void {
	if (
		values &&
		[...values]
			.sort((a, b) => a.index - b.index)
			.some((value, index) => value.index !== index)
	) {
		throw new Error(`${path} indexes must be contiguous from zero`);
	}
}
function cardsInHand(hand: string): string[] {
	return hand.split(".").flatMap((ranks, suitIndex) => {
		const suit = suits[suitIndex];
		return suit ? [...ranks].map((rank) => `${suit}${rank}`) : [];
	});
}
function assertAuctionSeatOrder(board: {
	auction?: z.infer<typeof auctionCallSchema>[];
	boardNumber: number;
	dealer: z.infer<typeof seatSchema>;
}): void {
	if (!board.auction) {
		return;
	}
	const dealerIndex = seats.indexOf(board.dealer);
	for (const action of board.auction) {
		const expected = seats[(dealerIndex + action.index) % seats.length];
		if (action.seat !== expected) {
			throw new Error(
				`BOARD_${board.boardNumber}_AUCTION_SEAT_ORDER_EXPECTED_${expected}_AT_${action.index}`
			);
		}
	}
}
function assertValidDealAndPlay(board: {
	boardNumber: number;
	hands: z.infer<typeof handsSchema>;
	play?: z.infer<typeof playActionSchema>[];
	dealer: z.infer<typeof seatSchema>;
	vulnerability: z.infer<typeof vulnerabilitySchema>;
	contract?: string;
	declarer?: z.infer<typeof seatSchema>;
	result?: number;
}): void {
	const cardsBySeat = Object.fromEntries(
		seats.map((seat) => [seat, cardsInHand(board.hands[seat])])
	) as Record<(typeof seats)[number], string[]>;
	for (const seat of seats) {
		if (cardsBySeat[seat].length !== 13) {
			throw new Error(`BOARD_${board.boardNumber}_${seat}_HAND_NOT_13_CARDS`);
		}
	}
	const dealCards = seats.flatMap((seat) => cardsBySeat[seat]);
	if (new Set(dealCards).size !== 52) {
		throw new Error(`BOARD_${board.boardNumber}_DEAL_NOT_UNIQUE_52_CARDS`);
	}
	if (!board.play) {
		return;
	}
	const played = new Set<string>();
	for (const action of board.play) {
		if (played.has(action.card)) {
			throw new Error(`BOARD_${board.boardNumber}_PLAY_DUPLICATE_CARD`);
		}
		if (!cardsBySeat[action.seat].includes(action.card)) {
			throw new Error(`BOARD_${board.boardNumber}_PLAY_CARD_NOT_IN_HAND`);
		}
		if (action.trickNumber !== Math.floor(action.index / 4) + 1) {
			throw new Error(`BOARD_${board.boardNumber}_PLAY_TRICK_MISMATCH`);
		}
		played.add(action.card);
	}
	analyzePlay(
		{
			boardNumber: board.boardNumber,
			contract: board.contract,
			dealer: board.dealer,
			declarer: board.declarer,
			hands: board.hands,
			result: board.result,
			vulnerability: board.vulnerability,
		},
		board.play
	);
}
function primitive(value: unknown): string | number | null {
	return typeof value === "string" || typeof value === "number" ? value : null;
}
function familyMetadata(
	tournament: z.infer<typeof skillTournamentSchema>
): Record<string, string | number | null> {
	if (tournament.family === "BP_CIRCUIT") {
		return {
			awarded: primitive(tournament.bpCircuit?.awarded),
			eventType: primitive(tournament.bpCircuit?.eventType),
			level: primitive(tournament.bpCircuit?.level),
			multiplier: primitive(tournament.bpCircuit?.multiplier),
		};
	}
	if (tournament.family === "DAILY") {
		return { region: primitive(tournament.daily?.region) };
	}
	return {
		level: primitive(tournament.series?.level),
		outcome: primitive(tournament.series?.outcome),
		period: primitive(tournament.series?.period),
	};
}
function normalizeBoard(
	board: z.infer<typeof skillBoardSchema> | z.infer<typeof partialBoardSchema>,
	warnings: string[]
): NormalizedFunbridgeBoard {
	assertDistinctIndexes(board.auction, `boards.${board.boardNumber}.auction`);
	assertDistinctIndexes(board.play, `boards.${board.boardNumber}.play`);
	assertSequentialIndexes(board.auction, `boards.${board.boardNumber}.auction`);
	assertSequentialIndexes(board.play, `boards.${board.boardNumber}.play`);
	assertAuctionSeatOrder(board);
	assertValidDealAndPlay(board);
	if (!board.auction) {
		warnings.push(`BOARD_${board.boardNumber}_AUCTION_MISSING`);
	}
	if (!board.play || board.play.length < 52) {
		warnings.push(`BOARD_${board.boardNumber}_PLAY_INCOMPLETE`);
	}
	const heroSeat = seatSchema.safeParse(
		"heroSeat" in board ? board.heroSeat : undefined
	);
	const status = z
		.enum(["NO_CONTRACT_OR_PLAY", "NO_PLAY", "PASSED_OUT"])
		.safeParse("status" in board ? board.status : undefined);
	return {
		auction: board.auction,
		comparison: board.comparison,
		deal: {
			boardNumber: board.boardNumber,
			contract: board.contract,
			dealer: board.dealer,
			declarer: board.declarer,
			hands: board.hands,
			result: board.result,
			vulnerability: board.vulnerability,
		},
		heroSeat: heroSeat.success ? heroSeat.data : undefined,
		play: board.play,
		playComplete: board.play?.length === 52,
		score: board.score,
		source: board.source,
		status: status.success ? status.data : undefined,
	};
}

export function parseFunbridgeJson(source: string): NormalizedFunbridgeFile {
	let raw: unknown;
	try {
		raw = JSON.parse(source);
	} catch {
		throw new Error("INVALID_FUNBRIDGE_JSON");
	}
	const index = funbridgeHistoryIndexSchema.safeParse(raw);
	if (index.success) {
		return {
			capturedAt: new Date(index.data.capturedAt),
			captureMode: index.data.source.captureMode,
			coverage: index.data.coverage,
			family: index.data.family,
			kind: "HISTORY_INDEX",
			locale: index.data.source.locale,
			tournaments: index.data.tournaments,
		};
	}
	const parsed = funbridgeJsonSchema.parse(raw);
	const warnings = [
		...("source" in parsed ? (parsed.source.warnings ?? []) : []),
	];
	const partialBoards =
		("partialBoards" in parsed ? parsed.partialBoards : undefined) ?? [];
	const boardNumbers = [...parsed.boards, ...partialBoards].map(
		(board) => board.boardNumber
	);
	if (new Set(boardNumbers).size !== boardNumbers.length) {
		throw new Error("DUPLICATE_BOARD_NUMBER");
	}
	if (parsed.tournament.boardCount !== boardNumbers.length) {
		warnings.push("BOARD_COUNT_MISMATCH");
	}
	return {
		boards: [...parsed.boards, ...partialBoards].map((board) =>
			normalizeBoard(board, warnings)
		),
		completion: parsed.tournament.completion,
		declaredBoardCount: parsed.tournament.boardCount,
		externalId:
			"source" in parsed
				? parsed.source.sourceTournamentId
				: parsed.tournament.funbridgeId,
		family: parsed.tournament.family,
		familyMetadata: familyMetadata(parsed.tournament),
		kind: "TOURNAMENT",
		name: parsed.tournament.name,
		participantCount: parsed.tournament.participantCount,
		playedAt: new Date(parsed.tournament.playedAt),
		rank: parsed.tournament.rank,
		score: parsed.tournament.score,
		scoreType: parsed.tournament.scoreType,
		warnings: [...new Set(warnings)],
	};
}
export function parseFunbridgeTournamentJson(
	source: string
): NormalizedFunbridgeImport {
	const parsed = parseFunbridgeJson(source);
	if (parsed.kind !== "TOURNAMENT") {
		throw new Error("FUNBRIDGE_HISTORY_INDEX_REQUIRES_HISTORY_IMPORT");
	}
	return parsed;
}
export function dealToPbn(deal: BridgeDeal): string {
	const start = seats.indexOf(deal.dealer);
	const order = Array.from(
		{ length: 4 },
		(_, offset) => seats[(start + offset) % 4] ?? "N"
	);
	return `${deal.dealer}:${order.map((seat) => deal.hands[seat]).join(" ")}`;
}
