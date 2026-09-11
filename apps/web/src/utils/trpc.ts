import type { AppRouter } from "@bridge-portal/api/routers/index";
import { env } from "@bridge-portal/env/web";
import { QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";

export const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: 1 } },
});

export const trpcClient = createTRPCClient<AppRouter>({
	links: [httpBatchLink({ url: `${env.VITE_SERVER_URL}/trpc` })],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
	client: trpcClient,
	queryClient,
});
