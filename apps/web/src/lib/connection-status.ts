export type ConnectionStatus = "loading" | "connected" | "disconnected";

interface HealthQueryState {
	data: "OK" | undefined;
	isError: boolean;
	isPending: boolean;
}

export function getConnectionStatus({
	data,
	isError,
	isPending,
}: HealthQueryState): ConnectionStatus {
	if (isPending) {
		return "loading";
	}
	if (isError || data !== "OK") {
		return "disconnected";
	}
	return "connected";
}
