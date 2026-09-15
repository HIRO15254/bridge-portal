import {
	type ConventionRule,
	defaultSystemSettings,
	getConventionRules,
	getRule,
	type OfficialItemId,
} from "@bridge-portal/domain";

export interface ConventionTopic {
	actions?: readonly string[];
	key: string;
	title: string;
	variant: string;
}

const openingNames: Record<string, string> = {
	"Natural 1NT": "ナチュラル1NTオープン",
	"Natural 2NT": "ナチュラル2NTオープン",
	"Natural 3NT": "ナチュラル3NTオープン",
	"Natural 4+-level NT": "ナチュラル4NT以上オープン",
	"Natural Strong Two": "ナチュラル・ストロング2オープン",
	"Weak Two": "ウィーク2オープン",
};

/** Topic keys belong to presentation; persisted JCBL IDs and variants remain stable. */
export function getConventionTopics(item: OfficialItemId): ConventionTopic[] {
	const definition = getRule(item);
	const rules = getConventionRules(item, defaultSystemSettings);
	const variants = [...(definition?.variants ?? [])];
	if (item === "A-OB-01") {
		variants.splice(variants.indexOf("Natural 1NT"), 1);
		variants.unshift("Natural 1NT");
	}
	return variants.flatMap((variant) => {
		if (item === "A-OB-01" && variant === "1-level natural") {
			return [
				{
					key: "natural-1m",
					title: "ナチュラル1mオープン",
					variant,
					actions: ["1♣", "1♦"],
				},
				{
					key: "natural-1M",
					title: "ナチュラル1Mオープン",
					variant,
					actions: ["1M"],
				},
			];
		}
		const first = rules.find((rule) => rule.variant === variant);
		return [
			{
				key: variant,
				variant,
				title:
					(item === "A-OB-01" ? openingNames[variant] : undefined) ??
					first?.title ??
					variant,
			},
		];
	});
}

export function rulesForTopic(rows: ConventionRule[], topic: ConventionTopic) {
	return rows.filter(
		(row) =>
			row.variant === topic.variant &&
			(!topic.actions || topic.actions.includes(row.action.value))
	);
}

export function resolveConventionTopic(item: OfficialItemId, key?: string) {
	const topics = getConventionTopics(item);
	return topics.find((topic) => topic.key === key) ?? topics[0];
}
