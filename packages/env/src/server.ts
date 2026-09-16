import { z } from "zod";

export const serverEnvSchema = z.object({
	BETTER_AUTH_SECRET: z.string().min(32),
	BETTER_AUTH_URL: z.url(),
	BOOTSTRAP_TOKEN: z.string().min(32).optional(),
	CORS_ORIGIN: z.url(),
	DB: z.unknown().refine((value) => value !== undefined),
	RAW_IMPORTS: z.unknown().refine((value) => value !== undefined),
});

export function createServerEnv<T extends Record<string, unknown>>(
	runtimeEnv: T
): T {
	serverEnvSchema.parse(runtimeEnv);
	return runtimeEnv;
}
