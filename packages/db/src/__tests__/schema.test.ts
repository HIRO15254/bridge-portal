import { describe, expect, it } from "vitest";

import { schema } from "../schema";

describe("template database schema", () => {
	it("starts without application tables", () => {
		expect(schema).toEqual({});
	});
});
