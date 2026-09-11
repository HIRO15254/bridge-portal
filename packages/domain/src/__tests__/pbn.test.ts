import { describe, expect, it } from "vitest";
import { exportPbn, parsePbn } from "../pbn";

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
		const reparsed = parsePbn(exportPbn(parsed.games));
		expect(reparsed.games[0]?.tags.Deal).toBe(parsed.games[0]?.tags.Deal);
		expect(reparsed.games[0]?.auction?.map((call) => call.call)).toEqual(
			parsed.games[0]?.auction?.map((call) => call.call)
		);
	});
});
