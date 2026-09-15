import {
	type SystemSettings,
	systemSettingsSchema,
} from "@bridge-portal/domain";

export function readSystemVariants(
	data: FormData,
	rules: readonly { officialItemId: string; variants: readonly string[] }[]
): Record<string, string[]> {
	const selected = Object.fromEntries(
		rules.map((rule) => [
			rule.officialItemId,
			rule.variants.filter((variant) =>
				data.has(`variant:${rule.officialItemId}:${variant}`)
			),
		])
	);
	const small = {
		FOURTH_HIGHEST: "Fourth highest",
		TOP_OF_NOTHING: "Top of Nothing",
		MUD: "MUD",
	}[String(data.get("fromSmall"))];
	selected["A-CA-01"] = [
		...(selected["A-CA-01"] ?? []).filter(
			(variant) => variant === "Honor sequence"
		),
		...(small ? [small] : []),
		`${String(data.get("fromAk"))} from AK`,
	];
	return selected;
}

/** Reads the same draft fields for the live rule view as for the saved system. */
export function readSystemForm(
	data: FormData,
	base: SystemSettings
): SystemSettings {
	const result: Record<string, Record<string, unknown>> = {};
	for (const [group, fields] of Object.entries(base)) {
		const values: Record<string, unknown> = { ...fields };
		for (const [key, previous] of Object.entries(fields)) {
			const name =
				group === "opening" && key === "oneLevelMinHcp"
					? "openingOneLevelMinHcp"
					: key;
			if (typeof previous === "boolean") {
				values[key] = data.has(name);
			} else if (typeof previous === "number" && data.has(name)) {
				values[key] = Number(data.get(name));
			} else if (typeof previous === "string" && data.has(name)) {
				values[key] = String(data.get(name));
			}
		}
		result[group] = values;
	}
	result.handDefinitions = { balancedShapes: data.getAll("balancedShapes") };
	result.signal = {
		...result.signal,
		priority: [1, 2, 3].map((n) => String(data.get(`signalPriority${n}`))),
	};
	return systemSettingsSchema.parse(result);
}
