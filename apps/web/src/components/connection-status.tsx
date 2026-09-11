import type { ConnectionStatus as Status } from "@/lib/connection-status";

const COPY: Record<Status, string> = {
	loading: "Checking API connection…",
	connected: "API connected",
	disconnected: "API disconnected",
};

const DOT_CLASSES: Record<Status, string> = {
	loading: "bg-amber-500",
	connected: "bg-emerald-500",
	disconnected: "bg-red-500",
};

export function ConnectionStatus({ status }: { status: Status }) {
	return (
		<div
			aria-live="polite"
			className="flex items-center gap-3 rounded-lg border bg-card p-4 text-card-foreground"
			role="status"
		>
			<span
				aria-hidden="true"
				className={`size-2.5 rounded-full ${DOT_CLASSES[status]}`}
			/>
			<span>{COPY[status]}</span>
		</div>
	);
}
