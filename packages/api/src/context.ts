import type { Database } from "@bridge-portal/db";

export interface Context extends Record<string, unknown> {
	db: Database;
}

export function createContextFactory(db: Database): () => Promise<Context> {
	return () => Promise.resolve({ db });
}
