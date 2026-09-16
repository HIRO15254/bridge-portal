import { env } from "@bridge-portal/env/web";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({ baseURL: env.VITE_SERVER_URL });

export async function autoSignInForPreview(): Promise<boolean> {
	const response = await fetch(
		`${env.VITE_SERVER_URL}/api/auth/preview/auto-login`,
		{
			credentials: "include",
			method: "POST",
		}
	);
	return response.ok;
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
