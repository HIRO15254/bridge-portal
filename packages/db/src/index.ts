import {
	type AnyD1Database,
	type DrizzleD1Database,
	drizzle,
} from "drizzle-orm/d1";

import { schema } from "./schema";

export type D1Database = AnyD1Database;
export type Database = DrizzleD1Database<typeof schema> & {
	$client: D1Database;
};

export function createDb(d1: D1Database): Database {
	return drizzle(d1, { schema });
}
