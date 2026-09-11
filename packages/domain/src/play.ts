import type { BridgeDeal, PlayAction, Seat } from "./types";

type Suit = "C" | "D" | "H" | "S";

export interface AnalyzedPlayAction extends PlayAction {
	remainingInLedSuitBefore: number;
	remainingInPlayedSuitBefore: number;
}

export interface AnalyzedTrick {
	actions: AnalyzedPlayAction[];
	leader: Seat;
	number: number;
	winner?: Seat;
}

const seats: Seat[] = ["N", "E", "S", "W"];
const suits: Suit[] = ["S", "H", "D", "C"];
const rankStrength = "23456789TJQKA";
const contractPattern = /^[1-7](C|D|H|S|NT)/i;

function nextSeat(seat: Seat, offset = 1): Seat {
	return seats[(seats.indexOf(seat) + offset) % seats.length] ?? "N";
}

function cardsBySeat(deal: BridgeDeal): Record<Seat, Set<string>> {
	return Object.fromEntries(
		seats.map((seat) => [
			seat,
			new Set(
				deal.hands[seat].split(".").flatMap((ranks, index) => {
					const suit = suits[index];
					return suit ? [...ranks].map((rank) => `${suit}${rank}`) : [];
				})
			),
		])
	) as Record<Seat, Set<string>>;
}

function countSuit(cards: ReadonlySet<string>, suit: string): number {
	return [...cards].filter((card) => card[0] === suit).length;
}

function trickWinner(actions: readonly PlayAction[], trump?: Suit): Seat {
	const ledSuit = actions[0]?.card[0];
	const trumpCards = trump
		? actions.filter((action) => action.card[0] === trump)
		: [];
	const eligible = trumpCards.length
		? trumpCards
		: actions.filter((action) => action.card[0] === ledSuit);
	return (
		[...eligible].sort(
			(left, right) =>
				rankStrength.indexOf(right.card[1] ?? "") -
				rankStrength.indexOf(left.card[1] ?? "")
		)[0]?.seat ??
		actions[0]?.seat ??
		"N"
	);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: legal trick validation is one state machine so seat, revoke, winner, and remaining-card state cannot drift apart.
export function analyzePlay(
	deal: BridgeDeal,
	play: readonly PlayAction[]
): AnalyzedTrick[] {
	const ordered = [...play].sort((left, right) => left.index - right.index);
	const remaining = cardsBySeat(deal);
	const played = new Set<string>();
	const contractStrain = contractPattern
		.exec(deal.contract ?? "")?.[1]
		?.toUpperCase();
	const trump =
		contractStrain && contractStrain !== "NT"
			? (contractStrain as Suit)
			: undefined;
	const tricks: AnalyzedTrick[] = [];
	let expectedLeader = deal.declarer ? nextSeat(deal.declarer) : undefined;

	for (const action of ordered) {
		if (action.index !== played.size) {
			throw new Error("PLAY_INDEX_NOT_CONTIGUOUS");
		}
		if (played.has(action.card)) {
			throw new Error("PLAY_DUPLICATE_CARD");
		}
		const hand = remaining[action.seat];
		if (!hand.has(action.card)) {
			throw new Error("PLAY_CARD_NOT_IN_HAND");
		}
		let trick = tricks.at(-1);
		if (!trick || trick.actions.length === 4) {
			if (expectedLeader && action.seat !== expectedLeader) {
				throw new Error("PLAY_WRONG_TRICK_LEADER");
			}
			trick = {
				actions: [],
				leader: action.seat,
				number: tricks.length + 1,
			};
			tricks.push(trick);
		}
		if (action.trickNumber !== trick.number) {
			throw new Error("PLAY_TRICK_NUMBER_MISMATCH");
		}
		const expectedSeat = nextSeat(trick.leader, trick.actions.length);
		if (action.seat !== expectedSeat) {
			throw new Error("PLAY_WRONG_SEAT_ORDER");
		}
		const ledSuit = trick.actions[0]?.card[0] ?? action.card[0] ?? "";
		if (action.card[0] !== ledSuit && countSuit(hand, ledSuit) > 0) {
			throw new Error("PLAY_REVOKE");
		}
		trick.actions.push({
			...action,
			remainingInLedSuitBefore: countSuit(hand, ledSuit),
			remainingInPlayedSuitBefore: countSuit(hand, action.card[0] ?? ""),
		});
		hand.delete(action.card);
		played.add(action.card);
		if (trick.actions.length === 4) {
			trick.winner = trickWinner(trick.actions, trump);
			expectedLeader = trick.winner;
		}
	}
	return tricks;
}
