import { account, session, user, verification } from "@bridge-portal/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";

// Cloudflare Workers rejects Web Crypto PBKDF2 iteration counts above 100,000.
const PBKDF2_ITERATIONS = 100_000;

function hexEncode(bytes: Uint8Array): string {
	return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexDecode(hex: string): Uint8Array {
	return new Uint8Array(
		hex.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? []
	);
}

export function constantTimeEqual(
	left: Uint8Array,
	right: Uint8Array
): boolean {
	let equal = left.length === right.length;
	const maxLength = Math.max(left.length, right.length);
	for (let index = 0; index < maxLength; index += 1) {
		if ((left[index] ?? 0) !== (right[index] ?? 0)) {
			equal = false;
		}
	}
	return equal;
}

async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const material = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(password),
		"PBKDF2",
		false,
		["deriveBits"]
	);
	const bits = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt,
			iterations: PBKDF2_ITERATIONS,
			hash: "SHA-256",
		},
		material,
		256
	);
	return `${hexEncode(salt)}:${hexEncode(new Uint8Array(bits))}`;
}

async function verifyPassword(data: {
	hash: string;
	password: string;
}): Promise<boolean> {
	const [saltHex = "", expectedHex = ""] = data.hash.split(":");
	const material = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(data.password),
		"PBKDF2",
		false,
		["deriveBits"]
	);
	const salt = hexDecode(saltHex);
	const bits = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt: salt.buffer as ArrayBuffer,
			iterations: PBKDF2_ITERATIONS,
			hash: "SHA-256",
		},
		material,
		256
	);
	return constantTimeEqual(new Uint8Array(bits), hexDecode(expectedHex));
}

export interface AuthOptions {
	allowSignUp?: boolean;
	baseURL: string;
	corsOrigin: string;
	previewAutoLogin?: boolean;
	secret: string;
}

function previewAutoLoginPlugin() {
	return {
		id: "preview-auto-login",
		endpoints: {
			previewAutoLogin: createAuthEndpoint(
				"/preview/auto-login",
				{ method: "POST" },
				async (context) => {
					const users = await context.context.internalAdapter.listUsers(2, 0);
					if (users.length !== 1) {
						return context.json(
							{ error: "PREVIEW_USER_NOT_AVAILABLE" },
							{ status: 409 }
						);
					}
					const previewUser = users[0];
					if (!previewUser) {
						return context.json(
							{ error: "PREVIEW_USER_NOT_AVAILABLE" },
							{ status: 409 }
						);
					}
					const previewSession =
						await context.context.internalAdapter.createSession(previewUser.id);
					await setSessionCookie(context, {
						session: previewSession,
						user: previewUser,
					});
					return context.json({ ok: true });
				}
			),
		},
	};
}

export function createAuth(
	db: Parameters<typeof drizzleAdapter>[0],
	options: AuthOptions
) {
	const usesSecureCookies = options.baseURL.startsWith("https://");

	return betterAuth({
		secret: options.secret,
		baseURL: options.baseURL,
		database: drizzleAdapter(db, {
			provider: "sqlite",
			schema: { account, session, user, verification },
		}),
		trustedOrigins: [options.corsOrigin],
		emailAndPassword: {
			enabled: true,
			disableSignUp: !options.allowSignUp,
			maxPasswordLength: 128,
			minPasswordLength: 12,
			password: { hash: hashPassword, verify: verifyPassword },
		},
		advanced: {
			defaultCookieAttributes: {
				httpOnly: true,
				sameSite: usesSecureCookies ? "none" : "lax",
				secure: usesSecureCookies,
			},
		},
		plugins: options.previewAutoLogin ? [previewAutoLoginPlugin()] : undefined,
	});
}
