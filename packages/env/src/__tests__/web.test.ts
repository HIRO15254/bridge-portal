import { describe, expect, it, vi } from "vitest";

import { createWebEnv } from "../web";

describe("createWebEnv", () => {
	it("accepts a valid server URL", () => {
		expect(
			createWebEnv({ VITE_SERVER_URL: "https://api.example.test" })
				.VITE_SERVER_URL
		).toBe("https://api.example.test");
	});

	it("rejects an invalid server URL", () => {
		const runtimeConsole = (
			globalThis as unknown as {
				console: { error: (...arguments_: unknown[]) => void };
			}
		).console;
		const error = vi
			.spyOn(runtimeConsole, "error")
			.mockImplementation(() => undefined);
		expect(() => createWebEnv({ VITE_SERVER_URL: "not-a-url" })).toThrow();
		error.mockRestore();
	});
});
