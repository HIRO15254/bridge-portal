import type { Database } from "@bridge-portal/db";

export interface Context extends Record<string, unknown> {
	db: Database;
	session: {
		user: {
			id: string;
			email: string;
			name: string;
		};
	} | null;
}

export function createContextFactory(
	db: Database,
	getSession: () => Promise<Context["session"]>
): () => Promise<Context> {
	return async () => ({ db, session: await getSession() });
}
