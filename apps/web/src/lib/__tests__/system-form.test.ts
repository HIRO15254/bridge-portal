import {
	defaultSystemSettings,
	JCBL_LIST_A_2026_05_01,
} from "@bridge-portal/domain";
import { describe, expect, it } from "vitest";
import { readSystemForm, readSystemVariants } from "../system-form";

function form() {
	const data = new FormData();
	for (const [group, fields] of Object.entries(defaultSystemSettings)) {
		for (const [key, value] of Object.entries(fields)) {
			const name =
				group === "opening" && key === "oneLevelMinHcp"
					? "openingOneLevelMinHcp"
					: key;
			if (typeof value === "boolean") {
				if (value) {
					data.set(name, "on");
				}
			} else if (typeof value === "number" || typeof value === "string") {
				data.set(name, String(value));
			}
		}
	}
	for (const shape of defaultSystemSettings.handDefinitions.balancedShapes) {
		data.append("balancedShapes", shape);
	}
	defaultSystemSettings.signal.priority.forEach((value, index) => {
		data.set(`signalPriority${index + 1}`, value);
	});
	return data;
}

describe("system draft form", () => {
	it("round-trips all settings and separates opening and overcall thresholds", () => {
		const data = form();
		expect(readSystemForm(data, defaultSystemSettings)).toEqual(
			defaultSystemSettings
		);
		data.set("openingOneLevelMinHcp", "11");
		data.set("oneLevelMinHcp", "7");
		data.set("balancedShapes", "4333");
		const saved = readSystemForm(data, defaultSystemSettings);
		expect(saved.opening.oneLevelMinHcp).toBe(11);
		expect(saved.overcall.oneLevelMinHcp).toBe(7);
		expect(saved.handDefinitions.balancedShapes).toEqual(["4333"]);
	});
	it("uses the same lead choices for the live preview and saved variants", () => {
		const data = form();
		data.set("fromSmall", "MUD");
		data.set("fromAk", "K");
		data.set("variant:A-CA-01:Honor sequence", "on");
		expect(readSystemVariants(data, JCBL_LIST_A_2026_05_01)["A-CA-01"]).toEqual(
			["Honor sequence", "MUD", "K from AK"]
		);
	});
});
