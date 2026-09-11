import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { ConnectionStatus } from "@/components/connection-status";
import { getConnectionStatus } from "@/lib/connection-status";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/")({ component: HomePage });

function HomePage() {
	const health = useQuery(trpc.healthCheck.queryOptions());
	const status = getConnectionStatus(health);

	return (
		<main className="mx-auto flex min-h-svh max-w-3xl items-center px-6 py-16">
			<section className="w-full space-y-6">
				<p className="font-medium text-muted-foreground text-sm uppercase tracking-widest">
					Cloudflare starter
				</p>
				<h1 className="font-semibold text-4xl tracking-tight sm:text-5xl">
					Better T App Template
				</h1>
				<p className="max-w-xl text-lg text-muted-foreground">
					React, Hono, tRPC, and an empty D1 database—ready for your
					application.
				</p>
				<ConnectionStatus status={status} />
			</section>
		</main>
	);
}
