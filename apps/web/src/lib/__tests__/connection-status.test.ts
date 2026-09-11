import { describe, expect, it } from "vitest";

import { getConnectionStatus } from "../connection-status";

describe("getConnectionStatus", () => {
	it("reports loading while the health query is pending", () => {
		expect(
			getConnectionStatus({ data: undefined, isError: false, isPending: true })
		).toBe("loading");
	});

	it("reports connected only for a successful OK response", () => {
		expect(
			getConnectionStatus({ data: "OK", isError: false, isPending: false })
		).toBe("connected");
	});

	it.each([
		{ data: undefined, isError: false },
		{ data: "OK" as const, isError: true },
	])("reports disconnected for $data with error=$isError", (state) => {
		expect(getConnectionStatus({ ...state, isPending: false })).toBe(
			"disconnected"
		);
	});
});
