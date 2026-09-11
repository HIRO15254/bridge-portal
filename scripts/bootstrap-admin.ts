export {};

const required = [
	"BRIDGE_PORTAL_API_URL",
	"BRIDGE_PORTAL_BOOTSTRAP_TOKEN",
	"BRIDGE_PORTAL_ADMIN_EMAIL",
	"BRIDGE_PORTAL_ADMIN_NAME",
	"BRIDGE_PORTAL_ADMIN_PASSWORD",
] as const;

for (const name of required) {
	if (!process.env[name]) {
		throw new Error(`${name} is required`);
	}
}

const apiUrl = process.env.BRIDGE_PORTAL_API_URL?.replace(/\/$/, "");
const response = await fetch(`${apiUrl}/api/bootstrap`, {
	body: JSON.stringify({
		email: process.env.BRIDGE_PORTAL_ADMIN_EMAIL,
		funbridgeId: process.env.BRIDGE_PORTAL_FUNBRIDGE_ID,
		name: process.env.BRIDGE_PORTAL_ADMIN_NAME,
		password: process.env.BRIDGE_PORTAL_ADMIN_PASSWORD,
	}),
	headers: {
		Authorization: `Bearer ${process.env.BRIDGE_PORTAL_BOOTSTRAP_TOKEN}`,
		"Content-Type": "application/json",
	},
	method: "POST",
});

if (!response.ok) {
	throw new Error(
		`Bootstrap failed (${response.status}): ${await response.text()}`
	);
}

const result = (await response.json()) as { user?: { email?: string } };
console.info(`Bridge Portal admin created: ${result.user?.email ?? "unknown"}`);
