import type { SystemSettings } from "./types";

export const conventionTerms = {
	balanced: {
		label: "バランスハンド",
		settingPath: "handDefinitions.balancedShapes",
		settingLabel: "コンベンション全体の設定 → 用語の定義 → バランスハンド",
	},
} as const;

export type ConventionTermId = keyof typeof conventionTerms;

export function describeConventionTerm(
	id: ConventionTermId,
	settings: SystemSettings
): string {
	if (id === "balanced") {
		return `${settings.handDefinitions.balancedShapes.join("・")}（スートの枚数を多い順に並べた形）`;
	}
	return "";
}

export function isBalancedHand(
	hand: string,
	settings: SystemSettings
): boolean {
	const lengths = hand.split(".").map((suit) => suit.length);
	if (
		lengths.length !== 4 ||
		lengths.reduce((total, n) => total + n, 0) !== 13
	) {
		return false;
	}
	const shape = [...lengths].sort((a, b) => b - a).join("");
	return settings.handDefinitions.balancedShapes.some(
		(candidate) => candidate === shape
	);
}

/** NT-specific exception; it does not redefine the shared balanced-hand term. */
export function isNaturalNtShape(
	hand: string,
	settings: SystemSettings,
	allowSingleton = false
): boolean {
	if (isBalancedHand(hand, settings)) {
		return true;
	}
	const suits = hand.split(".");
	return (
		allowSingleton &&
		suits.length === 4 &&
		suits
			.map((suit) => suit.length)
			.sort((a, b) => b - a)
			.join("") === "4441" &&
		suits.some((suit) => suit.length === 1 && ["A", "K", "Q"].includes(suit))
	);
}

export function staymanHandQualifies(
	hand: string,
	hcp: number,
	settings: SystemSettings
): boolean {
	const [spades = "", hearts = "", diamonds = ""] = hand.split(".");
	const config = settings.responseRebid;
	const weak =
		config.weakStayman &&
		hcp < config.staymanMinHcp &&
		spades.length === 4 &&
		hearts.length === 4 &&
		diamonds.length >= 4;
	return (
		weak ||
		(hcp >= config.staymanMinHcp &&
			(spades.length >= 4 || hearts.length >= 4) &&
			(!config.staymanExcludeFiveCardMajor ||
				Math.max(spades.length, hearts.length) <= 4))
	);
}
