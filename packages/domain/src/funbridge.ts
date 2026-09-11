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

const boardSchema = z.object({
	auction: z.array(auctionCallSchema).max(128).optional(),
	boardNumber: z.number().int().min(1),
	contract: z.string().trim().min(1).max(16).optional(),
	dealer: seatSchema,
	declarer: seatSchema.optional(),
	hands: z.object({
		E: handSchema,
		N: handSchema,
		S: handSchema,
		W: handSchema,
	}),
	heroSeat: seatSchema.optional(),
	play: z.array(playActionSchema).max(52).optional(),
	result: z.number().int().min(-13).max(13).optional(),
	score: z.number().optional(),
	vulnerability: vulnerabilitySchema,
});

const bpMetadataSchema = z.object({
	awarded: z.number().min(0).optional(),
	eventType: z.string().trim().min(1).optional(),
	level: z.string().trim().min(1),
	multiplier: z.number().positive().optional(),
});

const dailyMetadataSchema = z.object({
	region: z.string().trim().min(1),
});

const seriesMetadataSchema = z.object({
	level: z.string().trim().min(1),
	outcome: z.enum(["PROMOTED", "MAINTAINED", "RELEGATED", "PENDING"]),
	period: z.string().trim().min(1),
});

const tournamentSchema = z
	.object({
		boardCount: z.number().int().min(0),
		bpCircuit: bpMetadataSchema.optional(),
		completion: completionSchema,
		daily: dailyMetadataSchema.optional(),
		family: familySchema,
		funbridgeId: z.string().trim().min(1).max(128),
		id: z.string().trim().min(1).max(256),
		name: z.string().trim().min(1).max(200),
		participantCount: z.number().int().min(1).optional(),
		playedAt: z.string().datetime({ offset: true }),
		rank: z.number().int().min(1).optional(),
		score: z.number().optional(),
		scoreType: scoreTypeSchema,
		series: seriesMetadataSchema.optional(),
	})
	.superRefine((tournament, context) => {
		if (tournament.family === "BP_CIRCUIT" && !tournament.bpCircuit) {
			context.addIssue({
				code: "custom",
				message: "BP_CIRCUIT requires tournament.bpCircuit metadata",
				path: ["bpCircuit"],
			});
		}
		if (tournament.family === "DAILY" && !tournament.daily) {
			context.addIssue({
				code: "custom",
				message: "DAILY requires tournament.daily metadata",
				path: ["daily"],
			});
		}
		if (tournament.family === "SERIES" && !tournament.series) {
			context.addIssue({
				code: "custom",
				message: "SERIES requires tournament.series metadata",
				path: ["series"],
			});
		}
	});

export const funbridgeJsonSchema = z.object({
	boards: z.array(boardSchema).min(1).max(128),
	format: z.literal("FUNBRIDGE_EXPORT"),
	formatVersion: z.literal(1),
	tournament: tournamentSchema,
});

export type FunbridgeJsonFile = z.infer<typeof funbridgeJsonSchema>;

export interface NormalizedFunbridgeBoard {
	auction?: AuctionCall[];
	deal: BridgeDeal;
	heroSeat?: (typeof seats)[number];
	play?: PlayAction[];
	playComplete: boolean;
	score?: number;
}

export interface NormalizedFunbridgeImport {
	boards: NormalizedFunbridgeBoard[];
	completion: FunbridgeJsonFile["tournament"]["completion"];
	declaredBoardCount: number;
	externalId: string;
	family: TournamentFamily;
	familyMetadata: Record<string, string | number | null>;
	funbridgeId: string;
	name: string;
	participantCount?: number;
	playedAt: Date;
	rank?: number;
	score?: number;
	scoreType: "MP" | "IMP";
	warnings: string[];
}

function assertDistinctIndexes(
	values: { index: number }[] | undefined,
	path: string
): void {
	if (!values) {
		return;
	}
	const indexes = values.map((value) => value.index);
	if (new Set(indexes).size !== indexes.length) {
		throw new Error(`${path} contains duplicate indexes`);
	}
}

function cardsInHand(hand: string): string[] {
	return hand.split(".").flatMap((ranks, suitIndex) => {
		const suit = suits[suitIndex];
		return suit ? [...ranks].map((rank) => `${suit}${rank}`) : [];
	});
}

function assertSequentialIndexes(
	values: { index: number }[] | undefined,
	path: string
): void {
	if (!values) {
		return;
	}
	const ordered = [...values].sort((left, right) => left.index - right.index);
	if (ordered.some((value, index) => value.index !== index)) {
		throw new Error(`${path} indexes must be contiguous from zero`);
	}
}

function assertValidDealAndPlay(
	board: FunbridgeJsonFile["boards"][number]
): void {
	const cardsBySeat = Object.fromEntries(
		seats.map((seat) => [seat, cardsInHand(board.hands[seat])])
	) as Record<(typeof seats)[number], string[]>;
	for (const seat of seats) {
		if (cardsBySeat[seat].length !== 13) {
			throw new Error(`BOARD_${board.boardNumber}_${seat}_HAND_NOT_13_CARDS`);
		}
	}
	const dealCards = seats.flatMap((seat) => cardsBySeat[seat]);
	if (dealCards.length !== 52 || new Set(dealCards).size !== 52) {
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

function familyMetadata(
	tournament: FunbridgeJsonFile["tournament"]
): Record<string, string | number | null> {
	if (tournament.family === "BP_CIRCUIT") {
		return {
			awarded: tournament.bpCircuit?.awarded ?? null,
			eventType: tournament.bpCircuit?.eventType ?? null,
			level: tournament.bpCircuit?.level ?? null,
			multiplier: tournament.bpCircuit?.multiplier ?? null,
		};
	}
	if (tournament.family === "DAILY") {
		return { region: tournament.daily?.region ?? null };
	}
	return {
		level: tournament.series?.level ?? null,
		outcome: tournament.series?.outcome ?? null,
		period: tournament.series?.period ?? null,
	};
}

export function parseFunbridgeJson(source: string): NormalizedFunbridgeImport {
	let raw: unknown;
	try {
		raw = JSON.parse(source);
	} catch {
		throw new Error("INVALID_FUNBRIDGE_JSON");
	}
	const parsed = funbridgeJsonSchema.parse(raw);
	const warnings: string[] = [];
	if (parsed.tournament.boardCount !== parsed.boards.length) {
		warnings.push("BOARD_COUNT_MISMATCH");
	}
	const boardNumbers = parsed.boards.map((board) => board.boardNumber);
	if (new Set(boardNumbers).size !== boardNumbers.length) {
		throw new Error("DUPLICATE_BOARD_NUMBER");
	}
	const boards = parsed.boards.map((board) => {
		assertDistinctIndexes(board.auction, `boards.${board.boardNumber}.auction`);
		assertDistinctIndexes(board.play, `boards.${board.boardNumber}.play`);
		assertSequentialIndexes(
			board.auction,
			`boards.${board.boardNumber}.auction`
		);
		assertSequentialIndexes(board.play, `boards.${board.boardNumber}.play`);
		assertValidDealAndPlay(board);
		if (!board.auction) {
			warnings.push(`BOARD_${board.boardNumber}_AUCTION_MISSING`);
		}
		if (!board.play || board.play.length < 52) {
			warnings.push(`BOARD_${board.boardNumber}_PLAY_INCOMPLETE`);
		}
		return {
			auction: board.auction,
			deal: {
				boardNumber: board.boardNumber,
				contract: board.contract,
				dealer: board.dealer,
				declarer: board.declarer,
				hands: board.hands,
				result: board.result,
				vulnerability: board.vulnerability,
			},
			heroSeat: board.heroSeat,
			play: board.play,
			playComplete: board.play?.length === 52,
			score: board.score,
		};
	});
	return {
		boards,
		completion: parsed.tournament.completion,
		declaredBoardCount: parsed.tournament.boardCount,
		externalId: parsed.tournament.id,
		family: parsed.tournament.family,
		familyMetadata: familyMetadata(parsed.tournament),
		funbridgeId: parsed.tournament.funbridgeId,
		name: parsed.tournament.name,
		participantCount: parsed.tournament.participantCount,
		playedAt: new Date(parsed.tournament.playedAt),
		rank: parsed.tournament.rank,
		score: parsed.tournament.score,
		scoreType: parsed.tournament.scoreType,
		warnings: [...new Set(warnings)],
	};
}

export function dealToPbn(deal: BridgeDeal): string {
	const order = seatOrderFrom(deal.dealer);
	return `${deal.dealer}:${order.map((seat) => deal.hands[seat]).join(" ")}`;
}

function seatOrderFrom(
	first: (typeof seats)[number]
): (typeof seats)[number][] {
	const start = seats.indexOf(first);
	return Array.from(
		{ length: 4 },
		(_, offset) => seats[(start + offset) % 4] ?? "N"
	);
}
