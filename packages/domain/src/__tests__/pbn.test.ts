import { describe, expect, it } from "vitest";
import { dealToPbn, parseFunbridgeJson } from "../funbridge";
import {
	contractResultToTricks,
	createDoubleDummyPbnTags,
	exportPbn,
	parsePbn,
} from "../pbn";
import capturedBpCircuitFixture from "./fixtures/funbridge-bp-circuit-captured-anonymized.json";

const SAMPLE = `% PBN 2.1
[Event "Daily Asia"]
[Site "Funbridge"]
[Date "2026.09.11"]
[Board "1"]
[West "Argine"]
[North "Argine"]
[East "Argine"]
[South "hero"]
[Dealer "N"]
[Vulnerable "None"]
[Deal "N:AKQ.JT9.876.5432 9872.876.543.AKQ JT6.AKQ.AKQ.JT98 543.5432.JT92.76"]
[Scoring "MP"]
[Declarer "S"]
[Contract "3NT"]
[Result "9"]
[FunbridgeTournamentId "daily-1"]
[FunbridgeTournamentFamily "DAILY"]
[FunbridgePlayerId "hero"]
[FunbridgePlayedAt "2026-09-11T10:00:00+09:00"]
[FunbridgeCompletion "COMPLETED"]
[FunbridgeBoardCount "1"]
[FunbridgeTournamentScore "52.4"]
[FunbridgeRank "10"]
[FunbridgeParticipantCount "100"]
[FunbridgeRegion "ASIA_OCEANIA"]
[Auction "N"]
1C Pass 1H Pass 1NT Pass 3NT Pass Pass Pass
[Play "W"]
S9 SA S6 S2 *`;

describe("PBN profile", () => {
	it("parses custom tags and incomplete play", () => {
		const parsed = parsePbn(SAMPLE);
		expect(parsed.games).toHaveLength(1);
		expect(parsed.games[0]?.tags.FunbridgeTournamentFamily).toBe("DAILY");
		expect(parsed.games[0]?.auction).toHaveLength(10);
		expect(parsed.games[0]?.incompletePlay).toBe(true);
	});

	it("exports a document that can be parsed again", () => {
		const parsed = parsePbn(SAMPLE);
		Object.assign(
			parsed.games[0]?.tags ?? {},
			createDoubleDummyPbnTags({
				actualContractMaxTricks: 10,
				ddTable: { NS: 10, EW: 3 },
				par: { contracts: ["4S N"], score: 620 },
				solverVersion: "dds-wasm-test",
			})
		);
		const reparsed = parsePbn(exportPbn(parsed.games));
		expect(reparsed.games[0]?.tags.Deal).toBe(parsed.games[0]?.tags.Deal);
		expect(reparsed.games[0]?.auction?.map((call) => call.call)).toEqual(
			parsed.games[0]?.auction?.map((call) => call.call)
		);
		expect(reparsed.games[0]?.play?.map((action) => action.card)).toEqual(
			parsed.games[0]?.play?.map((action) => action.card)
		);
		expect(reparsed.games[0]?.play?.map((action) => action.seat)).toEqual(
			parsed.games[0]?.play?.map((action) => action.seat)
		);
		expect(reparsed.games[0]?.tags.Result).toBe(parsed.games[0]?.tags.Result);
		expect(reparsed.games[0]?.tags.DoubleDummyTable).toBe('{"EW":3,"NS":10}');
		expect(reparsed.games[0]?.tags.ParContracts).toBe("4S N");
	});

	it("round-trips a complete play when successive trick leaders change", () => {
		const imported = parseFunbridgeJson(
			JSON.stringify(capturedBpCircuitFixture)
		);
		const board = imported.boards[0];
		if (!board?.play) {
			throw new Error("Captured fixture has no play");
		}
		const game = {
			auction: board.auction,
			incompleteAuction: false,
			incompletePlay: false,
			play: board.play,
			tags: {
				Contract: board.deal.contract ?? "?",
				Deal: dealToPbn(board.deal),
				Declarer: board.deal.declarer ?? "?",
				Play: board.play[0]?.seat ?? "W",
			},
			warnings: [],
		};
		const reparsed = parsePbn(exportPbn([game])).games[0];
		expect(reparsed?.play).toEqual(board.play);
	});

	it("converts a stored result delta to the PBN trick count", () => {
		expect(contractResultToTricks("4SX", 1)).toBe("11");
		expect(contractResultToTricks("3NT", -1)).toBe("8");
		expect(contractResultToTricks(undefined, 0)).toBe("?");
	});
});
