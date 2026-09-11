import { describe, expect, it } from "vitest";
import { createServerEnv } from "../server";

describe("server env", () => {
	it("requires auth, D1 and R2 bindings", () => {
		expect(() =>
			createServerEnv({ CORS_ORIGIN: "https://example.com" })
		).toThrow();
		expect(
			createServerEnv({
				BETTER_AUTH_SECRET: "x".repeat(32),
				BETTER_AUTH_URL: "https://api.example.com",
				CORS_ORIGIN: "https://example.com",
				DB: {},
				RAW_IMPORTS: {},
			})
		).toBeTruthy();
	});
});
