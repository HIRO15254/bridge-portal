import { createEnv } from "@t3-oss/env-core";
import z from "zod";

export const webEnvSchema = {
	clientPrefix: "VITE_" as const,
	client: { VITE_SERVER_URL: z.url() },
	emptyStringAsUndefined: true as const,
};

export function createWebEnv(
	runtimeEnv: Record<string, string | number | boolean | undefined>
) {
	return createEnv({ ...webEnvSchema, runtimeEnv });
}

type WebEnv = ReturnType<typeof createWebEnv>;
let cachedEnv: WebEnv | undefined;

export const env = new Proxy({} as WebEnv, {
	get(_target, property) {
		cachedEnv ??= createWebEnv(
			(import.meta as unknown as { env: Record<string, string | undefined> })
				.env
		);
		return cachedEnv[property as keyof WebEnv];
	},
});
