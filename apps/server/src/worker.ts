import { createContextFactory } from "@better-t-app-template/api/context";
import { appRouter } from "@better-t-app-template/api/routers/index";
import { createDb } from "@better-t-app-template/db";
import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono<{ Bindings: Env }>();

app.use("/*", (context, next) =>
	cors({
		origin: context.env.CORS_ORIGIN,
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type"],
	})(context, next)
);

app.use("/trpc/*", (context, next) => {
	const db = createDb(context.env.DB);
	return trpcServer({
		router: appRouter,
		createContext: createContextFactory(db),
	})(context, next);
});

app.get("/", (context) => context.text("OK"));

export { app };
export default app;
