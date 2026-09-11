import type { RuleDefinition } from "./ruleset";
import type {
	AutomaticRuleVerdict,
	BridgeDeal,
	RuleEvaluationResult,
	Seat,
	SystemSnapshot,
	TournamentFamily,
} from "./types";

export interface Convention {
	definition: string;
	id: string;
	name: string;
	type: "CONVENTION" | "CUE_BID" | "NATURAL" | "TREATMENT";
}

export interface RuleVersion extends RuleDefinition {
	readonly conventionId?: string;
	readonly versionId: string;
}

export interface RulesetVersion {
	effectiveDate: string;
	id: string;
	immutable: true;
	items: readonly RuleVersion[];
	officialUrl: string;
}

export interface SystemVersion extends SystemSnapshot {
	id: string;
	publishedAt: Date;
	versionNumber: number;
}

export interface Tournament {
	activeRevisionNumber: number;
	externalId: string;
	family: TournamentFamily;
	id: string;
	name: string;
	playedAt: Date;
	scoreType: "IMP" | "MP";
	systemVersionId?: string;
}

export interface BoardAttempt {
	auctionCallCount: number;
	deal: BridgeDeal;
	heroSeat?: Seat;
	id: string;
	playActionCount: number;
	score?: number;
	systemVersionId?: string;
	tournamentId: string;
}

export interface RuleEvaluation extends RuleEvaluationResult {
	automaticVerdict: AutomaticRuleVerdict;
	evaluationRunId: string;
	id: string;
	override?: {
		correctedAt: Date;
		correctedByUserId: string;
		reason: string;
		verdict: AutomaticRuleVerdict;
	};
}
