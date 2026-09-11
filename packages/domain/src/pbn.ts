import type { AuctionCall, PlayAction, Seat } from "./types";

const seatOrder: Seat[] = ["N", "E", "S", "W"];
const noteTokenPattern = /^=\d+=$/;
const whitespacePattern = /\s+/;
const cardTokenPattern = /^[SHDC][AKQJT2-9]$/i;
const contractPattern = /^([1-7])(?:C|D|H|S|NT)/i;
const contractStrainPattern = /^[1-7](C|D|H|S|NT)/i;
const rankStrength = "23456789TJQKA";
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

export interface DoubleDummyPbnValue {
	actualContractMaxTricks: number | null;
	ddTable: Record<string, number>;
	par: { contracts: string[]; score: number };
	solverVersion: string;
}

export function createDoubleDummyPbnTags(
	value: DoubleDummyPbnValue
): Record<string, string> {
	const sortedTable = Object.fromEntries(
		Object.entries(value.ddTable).sort(([left], [right]) =>
			left.localeCompare(right)
		)
	);
	return {
		ActualContractMaxTricks:
			value.actualContractMaxTricks === null
				? "?"
				: String(value.actualContractMaxTricks),
		DoubleDummySolver: value.solverVersion,
		DoubleDummyTable: JSON.stringify(sortedTable),
		ParContracts: value.par.contracts.join(";"),
		ParScore: String(value.par.score),
	};
}

export function contractResultToTricks(
	contract: string | null | undefined,
	resultDelta: number | null | undefined
): string {
	if (resultDelta == null) {
		return "?";
	}
	const level = contractPattern.exec(contract ?? "")?.[1];
	return level ? String(Number(level) + 6 + resultDelta) : "?";
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

function winningSeat(
	actions: readonly Pick<PlayAction, "card" | "seat">[],
	contract: string | undefined
): Seat | undefined {
	if (actions.length !== 4) {
		return;
	}
	const strain = contractStrainPattern.exec(contract ?? "")?.[1]?.toUpperCase();
	const trump = strain && strain !== "NT" ? strain : undefined;
	const ledSuit = actions[0]?.card[0];
	const trumpCards = trump
		? actions.filter((action) => action.card[0] === trump)
		: [];
	const eligible = trumpCards.length
		? trumpCards
		: actions.filter((action) => action.card[0] === ledSuit);
	return [...eligible].sort(
		(left, right) =>
			rankStrength.indexOf(right.card[1] ?? "") -
			rankStrength.indexOf(left.card[1] ?? "")
	)[0]?.seat;
}

function playFrom(
	tokens: string[],
	firstColumn: Seat,
	contract: string | undefined
): PlayAction[] {
	const plays: PlayAction[] = [];
	const tableTokens = tokens.filter(
		(token) => token === "-" || token === "+" || cardTokenPattern.test(token)
	);
	let leader: Seat | undefined;
	for (let offset = 0; offset < tableTokens.length; offset += 4) {
		const row = tableTokens.slice(offset, offset + 4);
		const bySeat = new Map<Seat, string>();
		for (let column = 0; column < row.length; column += 1) {
			const token = row[column] ?? "-";
			if (!cardTokenPattern.test(token)) {
				continue;
			}
			bySeat.set(nextSeat(firstColumn, column), token.toUpperCase());
		}
		leader ??= [...bySeat.keys()][0];
		if (!leader) {
			continue;
		}
		const trickNumber = Math.floor(offset / 4) + 1;
		const actions: PlayAction[] = [];
		for (let turn = 0; turn < 4; turn += 1) {
			const seat = nextSeat(leader, turn);
			const card = bySeat.get(seat);
			if (card) {
				actions.push({
					card,
					index: plays.length + actions.length,
					seat,
					trickNumber,
				});
			}
		}
		plays.push(...actions);
		leader = winningSeat(actions, contract) ?? leader;
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
			game.play = playFrom(tokens, value as Seat, game.tags.Contract);
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

function playLines(game: PbnGame): string[] {
	if (!game.play) {
		return [];
	}
	const firstColumn = (game.tags.Play ?? game.play[0]?.seat ?? "W") as Seat;
	const ordered = [...game.play].sort(
		(left, right) => left.index - right.index
	);
	const trickNumbers = [
		...new Set(ordered.map((action) => action.trickNumber)),
	];
	return trickNumbers.map((trickNumber) => {
		const trick = ordered.filter(
			(action) => action.trickNumber === trickNumber
		);
		return Array.from({ length: 4 }, (_, column) => {
			const seat = nextSeat(firstColumn, column);
			return trick.find((action) => action.seat === seat)?.card ?? "-";
		}).join(" ");
	});
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
			sections.push(...playLines(game));
			if (game.incompletePlay) {
				sections.push("*");
			}
		}
		sections.push("");
	}
	return sections.join("\n");
}

export const PBN_REQUIRED_TOURNAMENT_TAGS = requiredTournamentTags;
