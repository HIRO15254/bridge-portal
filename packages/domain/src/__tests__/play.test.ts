import { describe, expect, it } from "vitest";

import { analyzePlay } from "../play";
import type { BridgeDeal, PlayAction } from "../types";

const deal: BridgeDeal = {
	boardNumber: 1,
	contract: "1NT",
	dealer: "N",
	declarer: "S",
	hands: {
		N: "AKQJ.AT98.32.432",
		E: "9876.7654.AK.QJ5",
		S: "T543.KQJ2.QJ.T98",
		W: "2.3.T987654.AK76",
	},
	vulnerability: "None",
};

const play: PlayAction[] = [
	{ card: "S2", index: 0, seat: "W", trickNumber: 1 },
	{ card: "SA", index: 1, seat: "N", trickNumber: 1 },
	{ card: "S9", index: 2, seat: "E", trickNumber: 1 },
	{ card: "ST", index: 3, seat: "S", trickNumber: 1 },
	{ card: "D2", index: 4, seat: "N", trickNumber: 2 },
	{ card: "DA", index: 5, seat: "E", trickNumber: 2 },
	{ card: "DQ", index: 6, seat: "S", trickNumber: 2 },
	{ card: "DT", index: 7, seat: "W", trickNumber: 2 },
];

describe("play sequence analysis", () => {
	it("tracks seats, trick winners and remaining suit counts", () => {
		const tricks = analyzePlay(deal, play);

		expect(tricks.map((trick) => trick.winner)).toEqual(["N", "E"]);
		expect(tricks[0]?.leader).toBe("W");
		expect(tricks[1]?.actions[0]?.remainingInPlayedSuitBefore).toBe(2);
	});

	it("rejects a next trick led by someone other than the winner", () => {
		const invalid = play.map((action) => ({ ...action }));
		const secondLead = invalid[4];
		if (secondLead) {
			secondLead.seat = "E";
			secondLead.card = "DA";
		}
		expect(() => analyzePlay(deal, invalid)).toThrow("PLAY_WRONG_TRICK_LEADER");
	});
});
