import type { AuctionCall, PlayAction, Seat } from "./types";

const seatOrder: Seat[] = ["N", "E", "S", "W"];
const noteTokenPattern = /^=\d+=$/;
const whitespacePattern = /\s+/;
const cardTokenPattern = /^[SHDC][AKQJT2-9]$/i;
const requiredTournamentTags = [
	"FunbridgeTournamentId",
	"FunbridgeTournamentFamily",
	"FunbridgePlayerId",
	"FunbridgePlayedAt",
	"FunbridgeCompletion",
	"FunbridgeBoardCount",
	"FunbridgeTournamentScore",
	"FunbridgeRank",
	"FunbridgeParticipantCount",
] as const;

export interface PbnGame {
	auction?: AuctionCall[];
	incompleteAuction: boolean;
	incompletePlay: boolean;
	play?: PlayAction[];
	tags: Record<string, string>;
	warnings: string[];
}

export interface PbnDocument {
	directives: string[];
	games: PbnGame[];
	warnings: string[];
}

function nextSeat(seat: Seat, offset: number): Seat {
	return seatOrder[(seatOrder.indexOf(seat) + offset) % 4] ?? "N";
}

function callsFrom(tokens: string[], dealer: Seat): AuctionCall[] {
	const calls: AuctionCall[] = [];
	let pendingNote: number | undefined;
	for (const token of tokens) {
		if (noteTokenPattern.test(token)) {
			pendingNote = Number(token.slice(1, -1));
			continue;
		}
		if (
			token === "*" ||
			token === "+" ||
			token.startsWith("$") ||
			token.startsWith("^")
		) {
			continue;
		}
		calls.push({
			call: token.toUpperCase(),
			index: calls.length,
			seat: nextSeat(dealer, calls.length),
			...(pendingNote ? { alert: String(pendingNote) } : {}),
		});
		pendingNote = undefined;
	}
	return calls;
}

function playFrom(tokens: string[], first: Seat): PlayAction[] {
	const plays: PlayAction[] = [];
	for (const token of tokens) {
		if (
			token === "*" ||
			token === "+" ||
			token === "-" ||
			noteTokenPattern.test(token) ||
			token.startsWith("$") ||
			token.startsWith("^")
		) {
			continue;
		}
		plays.push({
			card: token.toUpperCase(),
			index: plays.length,
			seat: nextSeat(first, plays.length),
			trickNumber: Math.floor(plays.length / 4) + 1,
		});
	}
	return plays;
}

function stripComments(value: string): string {
	return value.replace(/\{[^}]*\}/gs, " ").replace(/;[^\r\n]*/g, " ");
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: PBN sections require one stateful pass to preserve inheritance and section boundaries.
export function parsePbn(source: string): PbnDocument {
	const directives = [...source.matchAll(/^%\s*(.+)$/gm)].map(
		(match) => match[1]?.trim() ?? ""
	);
	const tagPattern = /^\[([A-Za-z][A-Za-z0-9_]*)\s+"((?:\\.|[^"])*)"\]\s*$/gm;
	const matches = [...source.matchAll(tagPattern)];
	const games: PbnGame[] = [];
	const inherited: Record<string, string> = {};
	let game: PbnGame | undefined;
	for (let index = 0; index < matches.length; index += 1) {
		const match = matches[index];
		if (!match) {
			continue;
		}
		const name = match[1] ?? "";
		const rawValue = (match[2] ?? "")
			.replace(/\\"/g, '"')
			.replace(/\\\\/g, "\\");
		const startsGame =
			name === "Event" || (name === "Board" && game?.tags.Board !== undefined);
		if (!game || startsGame) {
			game = {
				incompleteAuction: false,
				incompletePlay: false,
				tags: {},
				warnings: [],
			};
			games.push(game);
		}
		let value = rawValue;
		if (rawValue === "#") {
			value = inherited[name] ?? "?";
		} else if (rawValue.startsWith("##")) {
			value = rawValue.slice(2);
		}
		if (rawValue.startsWith("##") || (rawValue !== "#" && value !== "?")) {
			inherited[name] = value;
		}
		if (game.tags[name] === undefined || name === "Note") {
			game.tags[name] = value;
		}
		if (name !== "Auction" && name !== "Play") {
			continue;
		}
		const sectionStart = (match.index ?? 0) + match[0].length;
		const sectionEnd = matches[index + 1]?.index ?? source.length;
		const tokens = stripComments(source.slice(sectionStart, sectionEnd))
			.trim()
			.split(whitespacePattern)
			.filter(Boolean);
		if (name === "Auction") {
			const dealer = value as Seat;
			game.incompleteAuction = tokens.includes("*") || tokens.includes("+");
			game.auction = callsFrom(tokens, dealer);
		}
		if (name === "Play") {
			game.incompletePlay =
				tokens.includes("*") ||
				tokens.includes("+") ||
				tokens.filter((token) => cardTokenPattern.test(token)).length < 52;
			game.play = playFrom(tokens, value as Seat);
		}
	}
	for (const parsed of games) {
		for (const tag of requiredTournamentTags) {
			if (!parsed.tags[tag]) {
				parsed.warnings.push(`MISSING_${tag}`);
			}
		}
		if (!parsed.tags.Deal) {
			parsed.warnings.push("MISSING_Deal");
		}
	}
	return {
		directives,
		games,
		warnings: games.flatMap((item) => item.warnings),
	};
}

function escapeValue(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function exportPbn(games: PbnGame[]): string {
	const mandatory = [
		"Event",
		"Site",
		"Date",
		"Board",
		"West",
		"North",
		"East",
		"South",
		"Dealer",
		"Vulnerable",
		"Deal",
		"Scoring",
		"Declarer",
		"Contract",
		"Result",
	];
	const sections: string[] = ["% PBN 2.1"];
	for (const game of games) {
		const names = [
			...mandatory,
			...Object.keys(game.tags)
				.filter(
					(name) =>
						!mandatory.includes(name) && name !== "Auction" && name !== "Play"
				)
				.sort(),
		];
		for (const name of names) {
			sections.push(`[${name} "${escapeValue(game.tags[name] ?? "?")}"]`);
		}
		if (game.auction) {
			sections.push(
				`[Auction "${game.tags.Auction ?? game.tags.Dealer ?? "N"}"]`
			);
			sections.push(
				`${game.auction.map((call) => call.call).join(" ")}${game.incompleteAuction ? " *" : ""}`
			);
		}
		if (game.play) {
			sections.push(`[Play "${game.tags.Play ?? "W"}"]`);
			for (let i = 0; i < game.play.length; i += 4) {
				sections.push(
					game.play
						.slice(i, i + 4)
						.map((action) => action.card)
						.join(" ")
				);
			}
			if (game.incompletePlay) {
				sections.push("*");
			}
		}
		sections.push("");
	}
	return sections.join("\n");
}

export const PBN_REQUIRED_TOURNAMENT_TAGS = requiredTournamentTags;
