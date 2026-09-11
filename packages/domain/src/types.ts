import { z } from "zod";

export const tournamentFamilies = ["BP_CIRCUIT", "DAILY", "SERIES"] as const;
export type TournamentFamily = (typeof tournamentFamilies)[number];

export const automaticRuleVerdicts = [
	"COMPLIED",
	"DEVIATED_WRONG_APPLICATION",
	"DEVIATED_MISSED_OPPORTUNITY",
	"INDETERMINATE",
	"NOT_APPLICABLE",
] as const;
export const ruleVerdicts = [
	...automaticRuleVerdicts,
	"MANUALLY_OVERRIDDEN",
] as const;
export type RuleVerdict = (typeof ruleVerdicts)[number];
export type AutomaticRuleVerdict = (typeof automaticRuleVerdicts)[number];

export const seats = ["N", "E", "S", "W"] as const;
export type Seat = (typeof seats)[number];
export const strains = ["C", "D", "H", "S", "NT"] as const;
export type Strain = (typeof strains)[number];

export interface AuctionCall {
	alert?: string;
	call: string;
	index: number;
	seat: Seat;
}

export interface PlayAction {
	card: string;
	index: number;
	seat: Seat;
	trickNumber: number;
}

export interface BridgeDeal {
	boardNumber: number;
	contract?: string;
	dealer: Seat;
	declarer?: Seat;
	hands: Record<Seat, string>;
	result?: number;
	vulnerability: "None" | "NS" | "EW" | "Both";
}

export const systemSettingsSchema = z.object({
	opening: z.object({
		allowSingletonTopHonor: z.boolean(),
		oneLevelMinHcp: z.number().int().min(0).max(37),
		oneClubMinLength: z.number().int().min(0).max(13),
		oneDiamondMinLength: z.number().int().min(0).max(13),
		oneMajorMinLength: z.number().int().min(4).max(13),
		oneNtMinHcp: z.number().int().min(0).max(37),
		oneNtMaxHcp: z.number().int().min(0).max(37),
		naturalStrongTwoMinHcp: z.number().int().min(0).max(37),
		weakTwoMinHcp: z.number().int().min(0).max(37),
		weakTwoMaxHcp: z.number().int().min(0).max(37),
	}),
	responseRebid: z.object({
		minimumResponseHcp: z.number().int().min(0).max(37),
		invitationalMinHcp: z.number().int().min(0).max(37),
		gameForcingMinHcp: z.number().int().min(0).max(37),
		openerRebidMinHcp: z.number().int().min(0).max(37),
		openerRebidNewSuitMinLength: z.number().int().min(4).max(13),
		responderRebidMinHcp: z.number().int().min(0).max(37),
		responderRebidNewSuitMinLength: z.number().int().min(4).max(13),
		staymanBothMajorsResponse: z.enum(["H", "S"]),
		weakResponseMaxHcp: z.number().int().min(0).max(37),
		weakTwoInquiryMinHcp: z.number().int().min(0).max(37),
		weakTwoFeatureMinimumHonor: z.enum(["A", "K"]),
		weakTwoOgustMaximumMinHcp: z.number().int().min(0).max(37),
		weakTwoOgustGoodSuitTopHonors: z.number().int().min(1).max(3),
		blackwoodMinHcp: z.number().int().min(0).max(37),
		gerberMinHcp: z.number().int().min(0).max(37),
		grandSlamForceMinHcp: z.number().int().min(0).max(37),
		grandSlamForceGrandTopHonors: z.number().int().min(2).max(3),
		fitShowingJumpMinHcp: z.number().int().min(0).max(37),
	}),
	overcall: z.object({
		oneLevelMinHcp: z.number().int().min(0).max(37),
		oneLevelMinLength: z.number().int().min(4).max(13),
		twoLevelMinHcp: z.number().int().min(0).max(37),
		twoLevelMinLength: z.number().int().min(5).max(13),
	}),
	competitive: z.object({
		takeoutDoubleMinHcp: z.number().int().min(0).max(37),
		balancingTakeoutDoubleMinHcp: z.number().int().min(0).max(37),
		negativeDoubleMinHcp: z.number().int().min(0).max(37),
		sosRedoubleMaxHcp: z.number().int().min(0).max(37),
		gameForcingCueMinHcp: z.number().int().min(0).max(37),
		supportCueMinHcp: z.number().int().min(0).max(37),
		lightnerRequireVoid: z.boolean(),
	}),
	lead: z.object({
		fromAk: z.enum(["A", "K"]),
		fromSmall: z.enum(["FOURTH_HIGHEST", "TOP_OF_NOTHING", "MUD"]),
		honorSequence: z.literal("TOP"),
	}),
	signal: z.object({
		attitude: z.literal("HIGH_ENCOURAGING"),
		count: z.literal("HIGH_EVEN"),
		preference: z.literal("HIGH_HIGHER_SUIT"),
		priority: z
			.array(z.enum(["ATTITUDE", "COUNT", "SUIT_PREFERENCE"]))
			.length(3),
	}),
});
export type SystemSettings = z.infer<typeof systemSettingsSchema>;

export const defaultSystemSettings: SystemSettings = {
	opening: {
		allowSingletonTopHonor: false,
		oneLevelMinHcp: 12,
		oneClubMinLength: 3,
		oneDiamondMinLength: 3,
		oneMajorMinLength: 5,
		oneNtMinHcp: 15,
		oneNtMaxHcp: 17,
		naturalStrongTwoMinHcp: 20,
		weakTwoMinHcp: 6,
		weakTwoMaxHcp: 10,
	},
	responseRebid: {
		minimumResponseHcp: 6,
		invitationalMinHcp: 10,
		gameForcingMinHcp: 13,
		openerRebidMinHcp: 12,
		openerRebidNewSuitMinLength: 4,
		responderRebidMinHcp: 6,
		responderRebidNewSuitMinLength: 4,
		staymanBothMajorsResponse: "H",
		weakResponseMaxHcp: 7,
		weakTwoInquiryMinHcp: 10,
		weakTwoFeatureMinimumHonor: "K",
		weakTwoOgustMaximumMinHcp: 9,
		weakTwoOgustGoodSuitTopHonors: 2,
		blackwoodMinHcp: 16,
		gerberMinHcp: 16,
		grandSlamForceMinHcp: 18,
		grandSlamForceGrandTopHonors: 2,
		fitShowingJumpMinHcp: 10,
	},
	overcall: {
		oneLevelMinHcp: 8,
		oneLevelMinLength: 5,
		twoLevelMinHcp: 10,
		twoLevelMinLength: 5,
	},
	competitive: {
		takeoutDoubleMinHcp: 12,
		balancingTakeoutDoubleMinHcp: 9,
		negativeDoubleMinHcp: 6,
		sosRedoubleMaxHcp: 9,
		gameForcingCueMinHcp: 13,
		supportCueMinHcp: 10,
		lightnerRequireVoid: true,
	},
	lead: { fromAk: "A", fromSmall: "FOURTH_HIGHEST", honorSequence: "TOP" },
	signal: {
		attitude: "HIGH_ENCOURAGING",
		count: "HIGH_EVEN",
		preference: "HIGH_HIGHER_SUIT",
		priority: ["ATTITUDE", "COUNT", "SUIT_PREFERENCE"],
	},
};

export interface SystemSnapshot {
	adoptedOfficialItemIds: string[];
	name: string;
	rulesetVersion: string;
	selectedVariants: Record<string, string[]>;
	settings: SystemSettings;
}

export interface RuleEvaluationResult {
	actionIndex?: number;
	automaticVerdict: AutomaticRuleVerdict;
	evaluationKey: string;
	facts: Record<string, boolean | number | string | null>;
	reasonCode: string;
	ruleVersionId: string;
}
