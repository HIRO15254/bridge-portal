import { env } from "@bridge-portal/env/web";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({ baseURL: env.VITE_SERVER_URL });

export type PreviewSignInResult = "signed-in" | "unavailable" | "unreachable";

export async function autoSignInForPreview(): Promise<PreviewSignInResult> {
	const response = await fetch(
		`${env.VITE_SERVER_URL}/api/auth/preview/auto-login`,
		{
			credentials: "include",
			method: "POST",
		}
	);
	if (response.ok) {
		return "signed-in";
	}
	return response.status === 404 ? "unavailable" : "unreachable";
}

export function requestPreviewApiAccess(): void {
	const returnTo = new URL(window.location.href);
	returnTo.searchParams.delete("previewApiAccess");
	window.location.assign(
		`${env.VITE_SERVER_URL}/api/preview/access?returnTo=${encodeURIComponent(returnTo.toString())}`
	);
}

export async function registrationIsAvailable(): Promise<boolean> {
	const response = await fetch(
		`${env.VITE_SERVER_URL}/api/registration-status`,
		{
			credentials: "include",
		}
	);
	if (!response.ok) {
		throw new Error(`Registration status failed (${response.status})`);
	}
	const body = (await response.json()) as { available?: boolean };
	return body.available === true;
}
