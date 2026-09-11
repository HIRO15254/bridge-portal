import type { Database } from "@better-t-app-template/db";

export interface Context extends Record<string, unknown> {
	db: Database;
}

export function createContextFactory(db: Database): () => Promise<Context> {
	return () => Promise.resolve({ db });
}
